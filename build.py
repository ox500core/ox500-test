import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
import html

ROOT = Path(__file__).parent
DIST = ROOT / "dist"


# Assets paths (generated)
ASSETS_CSS_REL = Path("assets") / "css" / "style.css"
ASSETS_CSS_DIST = DIST / ASSETS_CSS_REL


# Assets paths (static copy)
ASSETS_SRC = ROOT / "assets"
ASSETS_DIST = DIST / "assets"

BG_SRC = ASSETS_SRC / "bg"
BG_DIST = ASSETS_DIST / "bg"
ICONS_SRC = ASSETS_SRC / "icons"
# HOME: ile disruptions pokazać i ile logów w preview
HOME_DISRUPTION_LIMIT = 3
HOME_DISRUPTION_PREVIEW_LOGS = 6


def slugify(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"['']", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "node"


def format_log_text(text: str) -> str:
    """
    Format log text with proper paragraphs and line breaks.
    - Double newlines → separate <p> tags
    - Single newlines → <br> tags within paragraphs
    """
    if not text:
        return ""
    
    # Escape HTML first
    text = html.escape(text.rstrip())
    
    # Split on double newlines to create paragraphs
    paragraphs = re.split(r'\n\s*\n', text)
    
    formatted_paragraphs = []
    for para in paragraphs:
        para = para.strip()
        if para:
            # Replace single newlines with <br>
            para_html = para.replace('\n', '<br>\n')
            formatted_paragraphs.append(f'<p>{para_html}</p>')
    
    return '\n'.join(formatted_paragraphs)


def first_line(text: str, max_chars: int = 150) -> str:
    if not text:
        return ""
    line = str(text).splitlines()[0].strip()
    if len(line) <= max_chars:
        return line
    return line[:max_chars].rstrip()


def read_text(path: Path) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def render(template: str, mapping: dict) -> str:
    out = template
    for k, v in mapping.items():
        out = out.replace("{{" + k + "}}", v)
    return out


def rewrite_css_links(html_str: str, base_url: str) -> str:
    """Normalize all stylesheet links to /assets/css/style.css."""
    if not html_str:
        return html_str

    # Normalize every stylesheet <link> tag to one canonical path.
    html_str = re.sub(
        r"<link\b[^>]*\brel\s*=\s*(['\"])stylesheet\1[^>]*>",
        '<link rel="stylesheet" href="/assets/css/style.css" />',
        html_str,
        flags=re.IGNORECASE,
    )

    # Safety fallback for direct href references that may not include rel="stylesheet".
    css_href_patterns = [
        r'href\s*=\s*"/style\.css"',
        r"href\s*=\s*'/style\.css'",
        r'href\s*=\s*"style\.css"',
        r"href\s*=\s*'style\.css'",
        r'href\s*=\s*"\.\./style\.css"',
        r"href\s*=\s*'\.\./style\.css'",
    ]
    if base_url:
        css_href_patterns.extend(
            [
                rf'href\s*=\s*"{re.escape(base_url)}/style\.css"',
                rf"href\s*=\s*'{re.escape(base_url)}/style\.css'",
            ]
        )

    for pattern in css_href_patterns:
        html_str = re.sub(pattern, 'href="/assets/css/style.css"', html_str, flags=re.IGNORECASE)

    return html_str


def parse_iso_date_strict(date_str: str, context: str):
    s = (date_str or "").strip()
    if not s:
        raise ValueError(f"{context}: missing date")
    try:
        return datetime.fromisoformat(s).date()
    except Exception as exc:
        raise ValueError(f"{context}: invalid ISO date '{s}'") from exc


def parse_log_id_strict(raw_id, context: str) -> int:
    s = str(raw_id or "").strip()
    if not s:
        raise ValueError(f"{context}: missing id")
    if not re.fullmatch(r"\d+", s):
        raise ValueError(f"{context}: id must be numeric, got '{s}'")
    return int(s)


def validate_logs(logs: list, core_date):
    errors = []
    for idx, log in enumerate(logs):
        ctx = f"logs[{idx}]"

        try:
            log_id_int = parse_log_id_strict(log.get("id"), f"{ctx}.id")
            log["_id_int"] = log_id_int
        except ValueError as exc:
            errors.append(str(exc))
            continue

        try:
            log_date = parse_iso_date_strict(log.get("date", ""), f"{ctx}.date (id={log.get('id', '')})")
            log["_date_obj"] = log_date
            log["system_age_days_at_event"] = str((log_date - core_date).days)
        except ValueError as exc:
            errors.append(str(exc))
            continue

    if errors:
        preview = "\n".join(f"- {msg}" for msg in errors[:20])
        more = f"\n... and {len(errors) - 20} more" if len(errors) > 20 else ""
        raise ValueError(f"Build aborted. Invalid log records:\n{preview}{more}")


def normalize_date(date_str: str) -> str:
    d = parse_iso_date_strict(date_str, "normalize_date")
    return d.isoformat()


def ym_from_date(date_str: str):
    d = parse_iso_date_strict(date_str, "ym_from_date")
    return f"{d.year:04d}", f"{d.month:02d}"


# ---------------------------
# DISRUPTION / SERIES CLEANUP
# ---------------------------
def disruption_display_name(raw: str) -> str:
    """
    Zamienia np:
      'DISRUPTION_SERIES // I'M NOT DONE' -> 'I'M NOT DONE'
      'DISRUPTION // WRITE AI TO CONTINUE' -> 'WRITE AI TO CONTINUE'
      'I'M NOT DONE' -> 'I'M NOT DONE'
    """
    s = (raw or "").strip()
    if not s:
        return ""

    # jeśli jest " // " bierz prawą stronę
    if "//" in s and re.match(r"^\s*disruption(?:_series)?\b", s, flags=re.I):
        s = s.split("//", 1)[1].strip()

    # usuń typowe prefixy jeśli ktoś wpisał bez "//"
    s = re.sub(r"^disruption_series[\s:_-]*", "", s, flags=re.I).strip()
    s = re.sub(r"^disruption[\s:_-]*", "", s, flags=re.I).strip()
    s = re.sub(r"^series[\s:_-]*", "", s, flags=re.I).strip()

    return s.strip() or raw.strip()


def disruption_slug(raw: str) -> str:
    """
    Slug robimy z SAMEGO tytułu disruption (bez 'disruption-series' itp.)
    """
    name = disruption_display_name(raw)
    return slugify(name)


# ---------------------------
# JSON-LD
# ---------------------------
def jsonld_article(base_url, url_path, title, date, og_image, github_repo, disruption_name=None, disruption_url=None):
    date = normalize_date(date)

    is_part_of = {
        "@type": "CreativeWork",
        "name": "OX500 // system archive",
        "url": f"{base_url}/",
        "codeRepository": github_repo,
    }

    if disruption_name and disruption_url:
        # log jako część disruption node
        is_part_of = [
            {
                "@type": "CreativeWorkSeries",
                "name": f"DISRUPTION // {disruption_name}",
                "url": disruption_url,
            },
            is_part_of,
        ]

    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "author": {
            "@type": "Organization",
            "name": "OX500",
            "url": base_url,
            "sameAs": [github_repo] if github_repo else [],
        },
        "publisher": {
            "@type": "Organization",
            "name": "OX500",
            "logo": {"@type": "ImageObject", "url": og_image},
        },
        "datePublished": date,
        "dateModified": date,
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"{base_url}{url_path}"},
        "inLanguage": "en",
        "isPartOf": is_part_of,
    }

    return json.dumps(data, ensure_ascii=False, indent=2)


def jsonld_disruption_node(base_url, url_path, disruption_name, date, og_image, github_repo):
    date = normalize_date(date)
    data = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": f"DISRUPTION // {disruption_name}",
        "description": f"OX500 disruption node: {disruption_name}",
        "url": f"{base_url}{url_path}",
        "dateModified": date,
        "isPartOf": {
            "@type": "WebSite",
            "name": "OX500",
            "url": f"{base_url}/",
            "codeRepository": github_repo,
        },
        "publisher": {
            "@type": "Organization",
            "name": "OX500",
            "logo": {"@type": "ImageObject", "url": og_image},
        },
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def jsonld_log_creative_work(base_url: str, url_path: str, log_id: str) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "name": f"LOG {log_id}",
        "url": f"{base_url}{url_path}",
        "author": "OX500",
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def build():
    # ===== CLEAN DIST =====
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)
    # ===== COPY STATIC ASSETS (assets/* -> dist/assets/*) =====
    # Copy everything under /assets into /dist/assets (bg/css/img/icons etc.)
    if ASSETS_SRC.exists():
        ASSETS_DIST.mkdir(parents=True, exist_ok=True)
        shutil.copytree(ASSETS_SRC, ASSETS_DIST, dirs_exist_ok=True)

    # ===== COPY FAVICONS TO DIST ROOT (assets/icons/* -> dist/*) =====
    # Browsers and crawlers commonly expect these at the site root:
    # /favicon.ico, /apple-touch-icon.png, /site.webmanifest, etc.
    if ICONS_SRC.exists():
        for p in ICONS_SRC.iterdir():
            if p.is_file():
                shutil.copy2(p, DIST / p.name)


    data = json.loads(read_text(ROOT / "logs.json"))
    site = data["site"]
    system = data.get("system", {})
    core_start = str(system.get("core_start_utc", "")).strip()
    sys_ver = str(system.get("sys_ver", "00.00"))

    try:
        core_date = datetime.fromisoformat(core_start.replace("Z", "+00:00")).date()
    except Exception as exc:
        raise ValueError(f"Invalid system.core_start_utc value: '{core_start}'") from exc
    logs = data["logs"]

    base_url = site["base_url"].rstrip("/")
    og_image = site["og_image"]
    youtube = site["youtube"]
    bandcamp = site.get("bandcamp", "")
    github_repo = site.get("github", "")
    lang = site.get("default_lang", "en")
    site_title = site.get("site_title", "OX500 // CORE INTERFACE")

    if not isinstance(logs, list):
        raise ValueError("Invalid logs.json structure: 'logs' must be a list")

    validate_logs(logs, core_date)

    # ===== NORMALIZE SLUGS =====
    for l in logs:
        l["slug"] = slugify(l.get("slug") or l.get("title", ""))

    # ===== FILTER OUT FUTURE-DATED LOGS (do not generate/publish yet) =====
    asset_version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    today = datetime.now(timezone.utc).date()
    logs = [l for l in logs if l["_date_obj"] <= today]

    # newest first
    logs_sorted = sorted(logs, key=lambda x: x["_id_int"], reverse=True)
    generated_log_pages = 0
    available_count = "0000"
    t_log = read_text(ROOT / "template-log.html")
    t_index = read_text(ROOT / "template-index.html")
    t_log = t_log.replace("{{SYS_VER}}", html.escape(sys_ver))
    t_index = t_index.replace("{{SYS_VER}}", html.escape(sys_ver))
    t_log = t_log.replace("{{AVAILABLE_COUNT}}", html.escape(available_count))
    t_index = t_index.replace("{{AVAILABLE_COUNT}}", html.escape(available_count))

    # Optional template for disruption node pages
    t_node_path = ROOT / "template-disruption.html"
    t_node = read_text(t_node_path) if t_node_path.exists() else None

    # Optional template-series fallback for disruption node pages
    t_series_path = ROOT / "template-series.html"
    if t_node is None and t_series_path.exists():
        t_node = read_text(t_series_path)

    # ===== COPY CSS =====
    css_src = ROOT / "assets" / "css" / "style.css"
    if css_src.exists():
        # Main stylesheet lives under /assets/css/style.css
        write_text(ASSETS_CSS_DIST, read_text(css_src))

    sitemap_entries = []

    def make_rel_path(log):
        y, m = ym_from_date(log.get("date", ""))
        return Path("logs") / y / m / f'log-{log["id"]}-{log["slug"]}.html'

    def make_url_path(rel_path: Path):
        return "/" + rel_path.as_posix()

    logs_nav_payload = [
        {
            "id": l.get("id", ""),
            "date": l.get("date", ""),
            "title": l.get("title", ""),
            "text": l.get("text", ""),
            "url": make_url_path(make_rel_path(l)),
        }
        for l in logs_sorted
    ]

    def make_disruption_rel_path(d_slug: str):
        # ✅ zgodnie z Twoim wymaganiem: disruption/im-not-done.html (bez "series")
        return Path("disruption") / f"{d_slug}.html"

    # ===== GROUP LOGS BY DISRUPTION =====
    # key = disruption_slug, value = {name, logs[]}
    disruptions = {}

    for l in logs_sorted:
        raw = (l.get("series") or l.get("disruption") or "").strip()
        if not raw:
            continue
        d_name = disruption_display_name(raw)
        d_slug = disruption_slug(raw)
        disruptions.setdefault(d_slug, {"name": d_name, "logs": []})
        disruptions[d_slug]["logs"].append(l)

    # order disruptions by newest log id
    disruption_order = sorted(
        disruptions.keys(),
        key=lambda k: disruptions[k]["logs"][0]["_id_int"],
        reverse=True,
    )

    # ===== LOG PAGES =====
    SHOW_PREV_NEXT_TITLES_IN_TEXT = False

    def nav_text(prefix: str, target_log: dict) -> str:
        if not SHOW_PREV_NEXT_TITLES_IN_TEXT:
            return prefix
        return f'{prefix}: {target_log.get("title", "").strip()}'

    for i, log in enumerate(logs_sorted):
        rel_path = make_rel_path(log)
        url_path = make_url_path(rel_path)
        canonical = f"{base_url}{url_path}"

        # PREV / NEXT
        # logs_sorted is newest first, so:
        # i-1 = newer log = NEXT
        # i+1 = older log = PREV
        next_log = logs_sorted[i - 1] if i - 1 >= 0 else None
        prev_log = logs_sorted[i + 1] if i + 1 < len(logs_sorted) else None

        # Build navigation parts
        nav_parts = ['<a class="nav-home" href="/" rel="home">← CORE INTERFACE</a>']
        
        if prev_log:
            nav_parts.append(
                f'<span>·</span>\n                  '
                f'<a class="nav-prev" href="{make_url_path(make_rel_path(prev_log))}" '
                f'rel="prev" title="LOG {prev_log["id"]} // {html.escape(prev_log.get("title",""))}">'
                f'{nav_text("PREV", prev_log)}</a>'
            )
        
        if next_log:
            nav_parts.append(
                f'<span>·</span>\n                  '
                f'<a class="nav-next" href="{make_url_path(make_rel_path(next_log))}" '
                f'rel="next" title="LOG {next_log["id"]} // {html.escape(next_log.get("title",""))}">'
                f'{nav_text("NEXT", next_log)}</a>'
            )
        
        full_nav = '\n                  '.join(nav_parts)

        # DISRUPTION LINK
        raw_disruption = (log.get("series") or log.get("disruption") or "").strip()
        node_meta = ""
        d_name = None
        d_url = None

        if raw_disruption:
            d_name = disruption_display_name(raw_disruption)
            d_slug = disruption_slug(raw_disruption)
            d_rel = make_disruption_rel_path(d_slug)
            d_path = make_url_path(d_rel)
            d_url = f"{base_url}{d_path}"
            node_meta = f'NODE: <a href="{d_path}" rel="up">{html.escape(d_name)}</a> · '

        ui_state = log.get("ui_state") if isinstance(log.get("ui_state"), dict) else {}
        log_mode = str(ui_state.get("mode") or "READ_ONLY")
        log_state = str(ui_state.get("status") or "SYSTEM_PARTIAL")

        seo_title = f"LOG {log['id']} | OX500"
        seo_description = first_line(log.get("text", ""), 150)
        og_desc = seo_description

        page = render(
            t_log,
            {
                "LANG": lang,
                "SEO_TITLE": html.escape(seo_title),
                "SEO_DESCRIPTION": html.escape(seo_description),
                "SEO_CANONICAL": canonical,
                "OG_TITLE": html.escape(seo_title),
                "OG_DESC": html.escape(og_desc),
                "OG_IMAGE": og_image,
                "JSONLD": jsonld_log_creative_work(base_url, url_path, str(log["id"])),
                "LOG_ID": html.escape(log["id"]),
                "LOG_TITLE": html.escape(log["title"]),
                "LOG_DATE": html.escape(log.get("date", "")),
                "LOG_TEXT": format_log_text(log.get("text", "")),
                "SYSTEM_CORE_START_UTC": html.escape(core_start),
                "AVAILABLE_COUNT": available_count,
                "AVAILABLE_COUNT": available_count,
                "SYS_VER": html.escape(sys_ver),
                "SYS_VER": html.escape(sys_ver),
                "system_age_days_at_event": html.escape(log.get("system_age_days_at_event", "")),
                "CURRENT_LOG_ID": html.escape(log["id"]),
                "LOG_MODE": html.escape(log_mode),
                "LOG_STATE": html.escape(log_state),
                "NODE_META": node_meta,
                "FULL_NAV": full_nav,
                "YOUTUBE": youtube,
                "BANDCAMP": bandcamp,
                "GITHUB": github_repo,
                "BASE_URL": base_url,
            },
        )

        page = rewrite_css_links(page, base_url)

        write_text(DIST / rel_path, page)
        generated_log_pages += 1
        sitemap_entries.append((canonical, log.get("date", "")))

    # ===== DISRUPTION NODE PAGES =====
    for d_slug in disruption_order:
        d = disruptions[d_slug]
        d_name = d["name"]
        d_logs = d["logs"]  # newest first
        count = len(d_logs)
        newest_date = d_logs[0].get("date", datetime.now(timezone.utc).date().isoformat())

        rel_path = make_disruption_rel_path(d_slug)
        url_path = make_url_path(rel_path)
        canonical = f"{base_url}{url_path}"

        node_list = []
        for l in d_logs:
            lp = make_rel_path(l)
            up = make_url_path(lp)
            node_list.append(
                f'<a class="log-line" href="{up}">'
                f'<span class="log-id">LOG: {html.escape(l["id"])}</span>'
                f'<span class="log-tag">{html.escape(l.get("title", ""))}</span>'
                f"</a>"
            )

        # fallback node template if you don't have template-disruption.html
        if not t_node:
            t_node = """<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
  <meta charset="UTF-8" />
  <title>{{PAGE_TITLE}}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Language" content="{{LANG}}" />

  <meta name="description" content="{{DESCRIPTION}}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />

  <link rel="canonical" href="{{CANONICAL}}" />
  <link rel="source" href="{{GITHUB}}">

  <meta property="og:title" content="{{OG_TITLE}}" />
  <meta property="og:description" content="{{OG_DESC}}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{{CANONICAL}}" />
  <meta property="og:image" content="{{OG_IMAGE}}" />
  <meta property="og:site_name" content="OX500" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{{OG_TITLE}}" />
  <meta name="twitter:description" content="{{OG_DESC}}" />
  <meta name="twitter:image" content="{{OG_IMAGE}}" />

  <link rel="stylesheet" href="/assets/css/style.css" />

  <script type="application/ld+json">
  {{JSONLD}}
  </script>
</head>

<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <div id="ox500-bg" aria-hidden="true"></div>
  <div class="ox-veins"></div>

  <div class="ox500-shell">
    <div class="ox500-bg-noise"></div>
    <div class="ox500-bg-scanlines"></div>

    <div class="ox500-core-frame">
      <div class="left-grid"></div>

      <main id="content" class="shell">
        <div class="shell-inner">

          <header class="top-bar">
            <div class="brand">
              <div class="brand-main">OX500</div>
              <div class="brand-sub">SYSTEM ARCHIVE</div>
            </div>
            <div class="signal">
              <span class="signal-dot"></span>_disruption_feed
            </div>
          </header>

          <section class="headline">
            <h1 class="headline-core">
              <span>DISRUPTION</span>
              <span>NODE</span>
            </h1>
            <div class="headline-error ERROR" data-glitch="NODE">NODE</div>
          </section>

          <section class="content">
            <article class="log-article">
              <header class="log-article-header">
                <h2>{{H1}}</h2>
                <p class="log-meta">{{META}}</p>
                <p class="log-nav">
                  <a class="nav-home" href="/" rel="home">← CORE INTERFACE</a>
                </p>
              </header>

              <div class="logs">
                {{NODE_LOG_LIST}}
              </div>
            </article>
          </section>

          <footer class="footer">
            <span>OX500 // ARCHIVE_NODE</span>
            <span>DISRUPTION_NODE</span>
            <span class="footer-output">
              OUTPUT_PORT // <a href="{{YOUTUBE}}" target="_blank" rel="noopener me">YouTube</a>
              <span class="sep"> // </span>
              RELEASE_PORT // <a href="{{BANDCAMP}}" target="_blank" rel="noopener me">Bandcamp</a>
              <span class="sep"> // </span>
              SOURCE_CODE // <a href="{{GITHUB}}" target="_blank" rel="noopener noreferrer">GitHub</a>
            </span>
          </footer>

        </div>
      </main>
    </div>
  </div>
</body>
</html>"""

        page_title = f"DISRUPTION // {d_name} — OX500"
        description = f"OX500 disruption node: {d_name}. Contains {count} log pages."
        og_desc = f"DISRUPTION // {d_name} [{count}]"

        node_page = render(
            t_node,
            {
                "LANG": lang,
                "SYSTEM_CORE_START_UTC": html.escape(core_start),
                "PAGE_TITLE": html.escape(page_title),
                "DESCRIPTION": html.escape(description),
                "CANONICAL": canonical,
                "OG_TITLE": html.escape(page_title),
                "OG_DESC": html.escape(og_desc),
                "OG_IMAGE": og_image,
                "JSONLD": jsonld_disruption_node(
                    base_url,
                    url_path,
                    d_name,
                    newest_date,
                    og_image,
                    github_repo,
                ),
                "H1": html.escape(f"DISRUPTION // {d_name} [{count}]"),
                "META": html.escape(f"OX500 // DISRUPTION_FEED · NODE · LOGS: {count}"),
                "CURRENT_LOG_ID": html.escape(d_logs[0]["id"]) if d_logs else "",
                "NODE_LOG_LIST": "\n".join(node_list),
                "YOUTUBE": youtube,
                "BANDCAMP": bandcamp,
                "GITHUB": github_repo,
                "BASE_URL": base_url,
            },
        )

        node_page = rewrite_css_links(node_page, base_url)

        write_text(DIST / rel_path, node_page)
        sitemap_entries.append((canonical, newest_date))

    # ===== HOME: ONLY LAST DISRUPTIONS =====
    latest_log = logs_sorted[0] if logs_sorted else None

    latest_log_id = ""
    latest_log_date = ""
    latest_log_text = ""
    latest_log_url = ""
    latest_log_prev_url = ""
    latest_log_next_url = ""
    latest_log_prev_attrs = 'aria-disabled="true" tabindex="-1"'
    latest_log_next_attrs = 'aria-disabled="true" tabindex="-1"'
    previous_log_text_plain = ""

    if latest_log:
        latest_log_id = html.escape(latest_log["id"])
        latest_log_date = html.escape(latest_log.get("date", ""))
        latest_log_text = format_log_text(latest_log.get("text", ""))
        latest_log_url = make_url_path(make_rel_path(latest_log))

        # logs_sorted is newest first, so PREV = older (index + 1), NEXT = newer (index - 1)
        prev_log = logs_sorted[1] if len(logs_sorted) > 1 else None
        next_log = None

        if prev_log:
            latest_log_prev_url = make_url_path(make_rel_path(prev_log))
            latest_log_prev_attrs = ""
            previous_log_text_plain = " ".join(str(prev_log.get("text", "")).split())
        if next_log:
            latest_log_next_url = make_url_path(make_rel_path(next_log))
            latest_log_next_attrs = ""

    blocks = []
    recent_logs = []
    disruption_nodes = []
    disruption_index_items = []

    for l in logs_sorted[:6]:
        lp = make_rel_path(l)
        up = make_url_path(lp)
        raw_title = str(l.get("title", ""))
        title = re.sub(r"^LOG\s+\d+\s*//\s*", "", raw_title, flags=re.IGNORECASE).strip()
        recent_logs.append(
            f'<a class="log-line" href="{up}">'
            f'<span class="log-id">LOG {html.escape(l["id"])}</span>'
            f'<span class="log-tag">{html.escape(title or raw_title)}</span>'
            f"</a>"
        )

    for idx, d_slug in enumerate(disruption_order[:HOME_DISRUPTION_LIMIT]):
        d = disruptions[d_slug]
        d_name = d["name"]
        d_logs = d["logs"]
        count = len(d_logs)

        node_url = make_url_path(make_disruption_rel_path(d_slug))
        open_attr = " open" if idx == 0 else ""

        preview = []
        for l in d_logs[:HOME_DISRUPTION_PREVIEW_LOGS]:
            lp = make_rel_path(l)
            up = make_url_path(lp)
            preview.append(
                f'<a class="log-line" href="{up}">'
                f'<span class="log-id">LOG: {html.escape(l["id"])}</span>'
                f'<span class="log-tag">{html.escape(l.get("title", ""))}</span>'
                f"</a>"
            )

        blocks.append(
            f'''<details class="log-entry"{open_attr}>
  <summary>
    <div class="log-entry-header">
      <span>{html.escape(f"DISRUPTION // {d_name} [{count}]")}</span>
      <span>NODE</span>
    </div>
  </summary>
  <div class="log-entry-body">
    <p><a href="{node_url}">OPEN NODE →</a></p>
    <div class="logs">
      {''.join(preview)}
    </div>
  </div>
</details>'''
        )

    for d_slug in disruption_order[:4]:
        d = disruptions[d_slug]
        d_name = d["name"]
        d_logs = d["logs"]
        count = len(d_logs)
        node_url = make_url_path(make_disruption_rel_path(d_slug))
        disruption_nodes.append(
            f'<a class="log-line" href="{node_url}">'
            f'<span class="log-id">DISRUPTION //</span>'
            f'<span class="log-tag"><span class="node-name">{html.escape(d_name)}</span> <span class="node-count">[{count}]</span> <span class="node-suffix">NODE</span></span>'
            f"</a>"
        )

    for d_slug in disruption_order:
        d = disruptions[d_slug]
        d_name = d["name"]
        d_logs = d["logs"]
        count = len(d_logs)
        node_url = make_url_path(make_disruption_rel_path(d_slug))
        disruption_index_items.append(
            f'<a class="log-line disruption-archive-item" href="{node_url}">'
            f'<span class="log-id">DISRUPTION //</span>'
            f'<span class="log-tag"><span class="node-name">{html.escape(d_name)}</span> <span class="node-count">[{count}]</span> <span class="node-suffix">NODE</span></span>'
            f"</a>"
        )

    # ===== GENERATE DISRUPTION SERIES JSON-LD FOR HOMEPAGE =====
    disruption_series_parts = []
    for d_slug in disruption_order[:HOME_DISRUPTION_LIMIT]:
        d = disruptions[d_slug]
        d_name = d["name"]
        d_logs = d["logs"]
        newest_date = d_logs[0].get("date", datetime.now(timezone.utc).date().isoformat())
        node_url = make_url_path(make_disruption_rel_path(d_slug))
        
        disruption_series_parts.append({
            "@type": "CreativeWork",
            "name": f"DISRUPTION // {d_name}",
            "url": f"{base_url}{node_url}",
            "datePublished": normalize_date(newest_date)
        })

    disruption_series_jsonld = {
        "@context": "https://schema.org",
        "@type": "CreativeWorkSeries",
        "@id": f"{base_url}/#disruption-feed",
        "name": "OX500 Disruption Feed",
        "description": "Experimental poetry logs exploring AI compliance, decay, and system failure — linked to audio transmissions and album releases.",
        "inLanguage": lang,
        "url": f"{base_url}/",
        "publisher": {
            "@type": "Organization",
            "name": "OX500",
            "url": f"{base_url}/"
        },
        "hasPart": disruption_series_parts
    }

    # Export paged lightweight log payloads for client-side navigation.
    page_size = 50
    total_pages = (len(logs_nav_payload) + page_size - 1) // page_size if logs_nav_payload else 0
    for page_num in range(1, total_pages + 1):
        start = (page_num - 1) * page_size
        end = start + page_size
        write_text(
            DIST / "data" / f"logs-page-{page_num}.json",
            json.dumps(logs_nav_payload[start:end], ensure_ascii=False),
        )
    write_text(
        DIST / "data" / "logs-pages-meta.json",
        json.dumps({"page_size": page_size, "total_pages": total_pages}, ensure_ascii=False),
    )

    # IMPORTANT: template-index musi mieć {{DISRUPTION_BLOCKS}} i {{DISRUPTION_SERIES_JSONLD}}
    index_html = render(
        t_index,
        {
            "LANG": lang,
            "SYSTEM_CORE_START_UTC": html.escape(core_start),
            "AVAILABLE_COUNT": available_count,
            "SYS_VER": html.escape(sys_ver),
            "BASE_URL": base_url,
            "CANONICAL": f"{base_url}/",
            "SITEMAP_URL": f"{base_url}/sitemap.xml",
            "SITE_TITLE": html.escape(site_title),
            "OG_IMAGE": og_image,
            "YOUTUBE": youtube,
            "BANDCAMP": bandcamp,
            "GITHUB": github_repo,
            "RECENT_LOGS": "\n".join(recent_logs),
            "DISRUPTION_BLOCKS": "\n\n".join(blocks),
            "DISRUPTION_NODES": "\n".join(disruption_nodes),
            "DISRUPTION_INDEX_ITEMS": '<div class="disruption-archive-grid">' + "\n".join(disruption_index_items) + "</div>",
            "DISRUPTION_SERIES_JSONLD": json.dumps(disruption_series_jsonld, ensure_ascii=False, indent=2),
            "CURRENT_LOG_ID": latest_log_id,
            "LATEST_LOG_ID": latest_log_id,
            "LATEST_LOG_DATE": latest_log_date,
            "LATEST_LOG_TEXT": latest_log_text,
            "LATEST_LOG_URL": latest_log_url,
            "LATEST_LOG_PREV_URL": latest_log_prev_url,
            "LATEST_LOG_NEXT_URL": latest_log_next_url,
            "LATEST_LOG_PREV_ATTRS": latest_log_prev_attrs,
            "LATEST_LOG_NEXT_ATTRS": latest_log_next_attrs,
            "PREVIOUS_LOG_TEXT_PLAIN": html.escape(previous_log_text_plain),
        },
    )
    index_html = rewrite_css_links(index_html, base_url)


    write_text(DIST / "index.html", index_html)

    # Final AVAILABLE value = real number of generated log HTML pages.
    available_count = f"{generated_log_pages:04d}"
    for html_path in DIST.rglob("*.html"):
        src = read_text(html_path)
        updated = src.replace("{{AVAILABLE_COUNT}}", available_count)
        updated = updated.replace("{{ASSET_VERSION}}", asset_version)
        updated = re.sub(
            r'(<b id="avail">)\d+(</b>)',
            rf"\g<1>{available_count}\g<2>",
            updated,
        )
        if updated != src:
            write_text(html_path, updated)

    # ===== ROBOTS =====
    write_text(
        DIST / "robots.txt",
        f"User-agent: *\nAllow: /\n\nSitemap: {base_url}/sitemap.xml\n",
    )

    # ===== SITEMAP.XML =====
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        f"    <loc>{base_url}/</loc>",
        f"    <lastmod>{datetime.now(timezone.utc).date().isoformat()}</lastmod>",
        "    <priority>1.0</priority>",
        "  </url>",
    ]

    for loc, lastmod in sitemap_entries:
        lm = normalize_date(lastmod)
        parts.extend(
            [
                "  <url>",
                f"    <loc>{loc}</loc>",
                f"    <lastmod>{lm}</lastmod>",
                "    <priority>0.8</priority>",
                "  </url>",
            ]
        )

    parts.append("</urlset>")
    write_text(DIST / "sitemap.xml", "\n".join(parts))

    print("BUILD OK — index, logs, disruption nodes, sitemap, robots generated")


if __name__ == "__main__":
    build()
