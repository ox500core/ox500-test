import json
import re
import shutil
import filecmp
import hashlib
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import html

# =========================================================
# CONFIG / CONSTANTS
# =========================================================
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
# HOME: how many disruptions to show and how many logs in preview
HOME_DISRUPTION_LIMIT = 3
HOME_DISRUPTION_PREVIEW_LOGS = 6
DISRUPTION_INDEX_PAGE_SIZE = 50
LOG_INDEX_PAGE_SIZE = 50
CLEAN_DIST_ON_BUILD = True
SHOW_PREV_NEXT_TITLES_IN_TEXT = False

TOKEN_RE = re.compile(r"\{\{([A-Z0-9_]+)\}\}")


@dataclass(frozen=True)
class SiteContext:
    base_url: str
    lang: str
    og_image: str
    youtube: str
    bandcamp: str
    github_repo: str
    core_start: str
    sys_ver: str
    site_title: str
    available_count: str
    asset_version: str

# =========================================================
# FALLBACK TEMPLATES
# =========================================================
FALLBACK_DISRUPTION_TEMPLATE = """<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
  <meta charset="UTF-8" />
  <title>{{PAGE_TITLE}}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Language" content="{{LANG}}" />

  <meta name="description" content="{{DESCRIPTION}}" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <meta name="googlebot" content="noindex, nofollow, noarchive" />

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
                <p>
                  <a class="nav-home" href="/" rel="home"><- CORE INTERFACE</a>
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



# =========================================================
# GENERIC HELPERS
# =========================================================
def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or ""))
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = re.sub(r"['']", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "node"


def format_log_text(text: str) -> str:
    """
    Format log text with proper paragraphs and line breaks.
    - Double newlines -> separate <p> tags
    - Single newlines -> <br> tags within paragraphs
    """
    if not text:
        return ""
    
    # Escape HTML first
    text = esc(text.rstrip())
    
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
    if (not CLEAN_DIST_ON_BUILD) and path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                if f.read() == content:
                    return
        except Exception:
            # Fallback to overwrite on any read/decode issue.
            pass
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def copy_file_if_changed(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if CLEAN_DIST_ON_BUILD:
        shutil.copy2(src, dst)
        return
    if dst.exists():
        try:
            if filecmp.cmp(src, dst, shallow=False):
                return
        except Exception:
            pass
    shutil.copy2(src, dst)


def copy_tree_if_changed(src_root: Path, dst_root: Path) -> None:
    for p in src_root.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(src_root)
        copy_file_if_changed(p, dst_root / rel)


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def make_log_line_link(href: str, log_id_text: str, tag_text: str, extra_class: str = "") -> str:
    cls = "log-line" + (f" {extra_class.strip()}" if extra_class.strip() else "")
    return (
        f'<a class="{esc(cls)}" href="{esc(href)}">'
        f'<span class="log-id">{esc(log_id_text)}</span>'
        f'<span class="log-tag">{esc(tag_text)}</span>'
        f"</a>"
    )


def make_disruption_node_link(href: str, name: str, count: int, extra_class: str = "") -> str:
    cls = "log-line" + (f" {extra_class.strip()}" if extra_class.strip() else "")
    return (
        f'<a class="{esc(cls)}" href="{esc(href)}">'
        f'<span class="log-id">DISRUPTION //</span>'
        f'<span class="log-tag"><span class="node-name">{esc(name)}</span> '
        f'<span class="node-count">[{count}]</span> <span class="node-suffix">NODE</span></span>'
        f"</a>"
    )


def utc_today():
    return datetime.now(timezone.utc).date()


def utc_today_iso() -> str:
    return utc_today().isoformat()


def make_log_rel_path(log: dict) -> Path:
    y, m = ym_from_date(log.get("date", ""))
    return Path("logs") / y / m / f'log-{log["id"]}-{log["slug"]}.html'


def make_url_path(rel_path: Path) -> str:
    return "/" + rel_path.as_posix()


def make_disruption_rel_path(d_slug: str) -> Path:
    # URL format: disruption/im-not-done.html (without "series")
    return Path("disruption") / f"{d_slug}.html"


# =========================================================
# TEMPLATE / LINK NORMALIZATION
# =========================================================
def render(template: str, mapping: dict) -> str:
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        if key not in mapping:
            return match.group(0)
        value = mapping.get(key)
        return "" if value is None else str(value)

    return TOKEN_RE.sub(_replace, template)


def rewrite_css_links(html_str: str, base_url: str) -> str:
    """Normalize legacy style.css hrefs to /assets/css/style.css, preserve other stylesheet links."""
    if not html_str:
        return html_str

    legacy_values = {
        "/style.css",
        "style.css",
        "../style.css",
    }
    if base_url:
        legacy_values.add(f"{base_url}/style.css")

    def _replace_href(match: re.Match) -> str:
        whole_tag = match.group(0)
        href_value = (match.group(3) or "").strip()
        if href_value in legacy_values:
            quote = match.group(2)
            return re.sub(
                r'href\s*=\s*(["\'])(.*?)\1',
                f'href={quote}/assets/css/style.css{quote}',
                whole_tag,
                count=1,
                flags=re.IGNORECASE,
            )
        return whole_tag

    # Touch only stylesheet links with legacy style.css href.
    html_str = re.sub(
        r'<link\b(?=[^>]*\brel\s*=\s*(["\'])stylesheet\1)(?=[^>]*\bhref\s*=\s*(["\'])(.*?)\2)[^>]*>',
        _replace_href,
        html_str,
        flags=re.IGNORECASE,
    )

    return html_str


def compute_asset_version() -> str:
    """Deterministic hash for cache-busting based on source assets + templates."""
    hasher = hashlib.sha256()
    paths = [
        ROOT / "logs.json",
        ROOT / "template-index.html",
        ROOT / "template-log.html",
        ROOT / "template-series.html",
        ROOT / "template-disruption.html",
    ]
    if ASSETS_SRC.exists():
        paths.extend(p for p in ASSETS_SRC.rglob("*") if p.is_file())
    for path in sorted({p for p in paths if p.exists()}, key=lambda x: x.as_posix()):
        hasher.update(path.as_posix().encode("utf-8"))
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hasher.update(chunk)
    return hasher.hexdigest()[:12]


def derive_sensor_code(asset_version: str) -> str:
    """Deterministic sensor code for a given build/version."""
    digest = hashlib.sha1((asset_version or "").encode("utf-8")).hexdigest()
    head = digest[:3].upper()
    tail = int(digest[3:5], 16) % 100
    return f"0x{head}-{tail:02d}"


# =========================================================
# VALIDATION
# =========================================================
def validate_site_config(data: dict) -> None:
    if not isinstance(data, dict):
        raise ValueError("Invalid logs.json: root object must be a JSON object")
    site = data.get("site")
    if not isinstance(site, dict):
        raise ValueError("Invalid logs.json: missing object 'site'")
    required_fields = ["base_url", "og_image", "youtube"]
    missing = [f for f in required_fields if not str(site.get(f, "")).strip()]
    if missing:
        raise ValueError(
            "Invalid logs.json: missing required site fields: "
            + ", ".join(f"site.{m}" for m in missing)
        )
    if not isinstance(data.get("logs"), list):
        raise ValueError("Invalid logs.json structure: 'logs' must be a list")


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


def validate_logs(logs: list) -> None:
    errors = []
    for idx, log in enumerate(logs):
        ctx = f"logs[{idx}]"

        try:
            parse_log_id_strict(log.get("id"), f"{ctx}.id")
        except ValueError as exc:
            errors.append(str(exc))
            continue

        try:
            parse_iso_date_strict(log.get("date", ""), f"{ctx}.date (id={log.get('id', '')})")
        except ValueError as exc:
            errors.append(str(exc))
            continue

    if errors:
        preview = "\n".join(f"- {msg}" for msg in errors[:20])
        more = f"\n... and {len(errors) - 20} more" if len(errors) > 20 else ""
        raise ValueError(f"Build aborted. Invalid log records:\n{preview}{more}")


def enrich_logs(logs: list, core_date) -> list:
    enriched = []
    for log in logs:
        log_id_int = parse_log_id_strict(log.get("id"), "enrich_logs.id")
        log_date = parse_iso_date_strict(log.get("date", ""), f"enrich_logs.date (id={log.get('id', '')})")
        new_log = dict(log)
        new_log["_id_int"] = log_id_int
        new_log["_date_obj"] = log_date
        new_log["system_age_days_at_event"] = str((log_date - core_date).days)
        enriched.append(new_log)
    return enriched


def normalize_date(date_str: str) -> str:
    d = parse_iso_date_strict(date_str, "normalize_date")
    return d.isoformat()


def ym_from_date(date_str: str):
    d = parse_iso_date_strict(date_str, "ym_from_date")
    return f"{d.year:04d}", f"{d.month:02d}"


# =========================================================
# DISRUPTION / SERIES CLEANUP
# =========================================================
def disruption_display_name(raw: str) -> str:
    """
    Converts e.g.:
      'DISRUPTION_SERIES // I'M NOT DONE' -> 'I'M NOT DONE'
      'DISRUPTION // WRITE AI TO CONTINUE' -> 'WRITE AI TO CONTINUE'
      'I'M NOT DONE' -> 'I'M NOT DONE'
    """
    s = (raw or "").strip()
    if not s:
        return ""

    # If input contains " // ", keep the right side.
    if "//" in s and re.match(r"^\s*disruption(?:_series)?\b", s, flags=re.I):
        s = s.split("//", 1)[1].strip()

    # Remove common prefixes even if input is without "//".
    s = re.sub(r"^disruption_series[\s:_-]*", "", s, flags=re.I).strip()
    s = re.sub(r"^disruption[\s:_-]*", "", s, flags=re.I).strip()
    s = re.sub(r"^series[\s:_-]*", "", s, flags=re.I).strip()

    return s.strip() or raw.strip()


def disruption_slug(raw: str) -> str:
    """
    Build the slug from only the disruption title
    (without 'disruption-series' prefixes, etc.).
    """
    name = disruption_display_name(raw)
    return slugify(name)


# =========================================================
# JSON-LD
# =========================================================
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


# =========================================================
# BUILD STAGES
# =========================================================
def stage_prepare_output() -> None:
    if CLEAN_DIST_ON_BUILD and DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)

    if ASSETS_SRC.exists():
        ASSETS_DIST.mkdir(parents=True, exist_ok=True)
        if CLEAN_DIST_ON_BUILD:
            shutil.copytree(ASSETS_SRC, ASSETS_DIST, dirs_exist_ok=True)
        else:
            copy_tree_if_changed(ASSETS_SRC, ASSETS_DIST)

    if ICONS_SRC.exists():
        for p in ICONS_SRC.iterdir():
            if p.is_file():
                copy_file_if_changed(p, DIST / p.name)


def stage_load_and_validate_source() -> dict:
    data = json.loads(read_text(ROOT / "logs.json"))
    validate_site_config(data)

    site = data["site"]
    system = data.get("system", {})
    core_start = str(system.get("core_start_utc", "")).strip()
    sys_ver = str(system.get("sys_ver", "00.00"))
    if not core_start:
        raise ValueError("Invalid logs.json: system.core_start_utc missing or empty")

    try:
        core_date = datetime.fromisoformat(core_start.replace("Z", "+00:00")).date()
    except Exception as exc:
        raise ValueError(f"Invalid system.core_start_utc value: '{core_start}'") from exc

    logs_raw = data["logs"]
    validate_logs(logs_raw)
    logs = enrich_logs(logs_raw, core_date)

    return {
        "site": site,
        "core_start": core_start,
        "sys_ver": sys_ver,
        "logs": logs,
    }


def stage_prepare_templates_and_css():
    t_log = read_text(ROOT / "template-log.html")
    t_index = read_text(ROOT / "template-index.html")

    t_node_path = ROOT / "template-disruption.html"
    t_node = read_text(t_node_path) if t_node_path.exists() else None

    t_series_path = ROOT / "template-series.html"
    if t_node is None and t_series_path.exists():
        t_node = read_text(t_series_path)

    css_src = ROOT / "assets" / "css" / "style.css"
    if css_src.exists():
        write_text(ASSETS_CSS_DIST, read_text(css_src))

    return t_log, t_index, t_node


# =========================================================
# BUILD PIPELINE
# =========================================================
def stage_group_disruptions(logs_sorted: list):
    disruptions = {}
    for log in logs_sorted:
        raw = (log.get("series") or log.get("disruption") or "").strip()
        if not raw:
            continue
        d_name = disruption_display_name(raw)
        d_slug = disruption_slug(raw)
        if d_slug in disruptions and disruptions[d_slug]["name"] != d_name:
            print(f"WARNING: slug collision '{d_slug}': '{disruptions[d_slug]['name']}' vs '{d_name}'")
        disruptions.setdefault(d_slug, {"name": d_name, "logs": []})
        disruptions[d_slug]["logs"].append(log)

    disruption_order = sorted(
        disruptions.keys(),
        key=lambda k: disruptions[k]["logs"][0]["_id_int"],
        reverse=True,
    )
    return disruptions, disruption_order


def stage_build_log_pages(
    logs_sorted: list,
    t_log: str,
    ctx: SiteContext,
    rel,
    url,
    disruption_rel,
    sitemap_entries: list,
) -> None:
    def nav_text(prefix: str, target_log: dict) -> str:
        if not SHOW_PREV_NEXT_TITLES_IN_TEXT:
            return prefix
        return f'{prefix}: {target_log.get("title", "").strip()}'

    for i, log in enumerate(logs_sorted):
        rel_path = rel(log)
        url_path = url(rel_path)
        canonical = f"{ctx.base_url}{url_path}"

        next_log = logs_sorted[i - 1] if i - 1 >= 0 else None
        prev_log = logs_sorted[i + 1] if i + 1 < len(logs_sorted) else None

        nav_parts = ['<a class="nav-home" href="/" rel="home"><- CORE INTERFACE</a>']
        if prev_log:
            nav_parts.append(
                f'<span>|</span>\n                  '
                f'<a class="nav-prev" href="{url(rel(prev_log))}" '
                f'rel="prev" title="LOG {prev_log["id"]} // {esc(prev_log.get("title",""))}">'
                f'{nav_text("PREV", prev_log)}</a>'
            )
        if next_log:
            nav_parts.append(
                f'<span>|</span>\n                  '
                f'<a class="nav-next" href="{url(rel(next_log))}" '
                f'rel="next" title="LOG {next_log["id"]} // {esc(next_log.get("title",""))}">'
                f'{nav_text("NEXT", next_log)}</a>'
            )
        full_nav = '\n                  '.join(nav_parts)

        raw_disruption = (log.get("series") or log.get("disruption") or "").strip()
        node_meta = ""
        if raw_disruption:
            d_path = url(disruption_rel(disruption_slug(raw_disruption)))
            d_name = disruption_display_name(raw_disruption)
            node_meta = f'NODE: <a href="{d_path}" rel="up">{esc(d_name)}</a> | '

        ui_state = log.get("ui_state") if isinstance(log.get("ui_state"), dict) else {}
        log_mode = str(ui_state.get("mode") or "READ_ONLY")
        log_state = str(ui_state.get("status") or "SYSTEM_PARTIAL")
        seo_title = f"LOG {log['id']} | OX500"
        seo_description = first_line(log.get("text", ""), 150)

        page = render(
            t_log,
            {
                "LANG": ctx.lang,
                "SEO_TITLE": esc(seo_title),
                "SEO_DESCRIPTION": esc(seo_description),
                "SEO_CANONICAL": canonical,
                "OG_TITLE": esc(seo_title),
                "OG_DESC": esc(seo_description),
                "OG_IMAGE": ctx.og_image,
                "JSONLD": jsonld_log_creative_work(ctx.base_url, url_path, str(log["id"])),
                "LOG_ID": esc(log["id"]),
                "LOG_TITLE": esc(log["title"]),
                "LOG_DATE": esc(log.get("date", "")),
                "LOG_TEXT": format_log_text(log.get("text", "")),
                "SYSTEM_CORE_START_UTC": esc(ctx.core_start),
                "AVAILABLE_COUNT": ctx.available_count,
                "SYS_VER": esc(ctx.sys_ver),
                "system_age_days_at_event": esc(log.get("system_age_days_at_event", "")),
                "CURRENT_LOG_ID": esc(log["id"]),
                "LOG_MODE": esc(log_mode),
                "LOG_STATE": esc(log_state),
                "NODE_META": node_meta,
                "FULL_NAV": full_nav,
                "YOUTUBE": ctx.youtube,
                "BANDCAMP": ctx.bandcamp,
                "GITHUB": ctx.github_repo,
                "BASE_URL": ctx.base_url,
                "ASSET_VERSION": ctx.asset_version,
            },
        )

        page = rewrite_css_links(page, ctx.base_url)
        write_text(DIST / rel_path, page)
        sitemap_entries.append((canonical, log.get("date", "")))


def stage_build_disruption_pages(
    disruption_order: list,
    disruptions: dict,
    t_node: str,
    ctx: SiteContext,
    rel,
    url,
    disruption_rel,
    sitemap_entries: list,
) -> None:
    node_template = t_node or FALLBACK_DISRUPTION_TEMPLATE

    for d_slug in disruption_order:
        d = disruptions[d_slug]
        d_name = d["name"]
        d_logs = d["logs"]
        count = len(d_logs)
        newest_date = d_logs[0].get("date", utc_today_iso())

        rel_path = disruption_rel(d_slug)
        url_path = url(rel_path)
        canonical = f"{ctx.base_url}{url_path}"

        node_list = []
        for log in d_logs:
            node_list.append(make_log_line_link(url(rel(log)), f'LOG: {log["id"]}', log.get("title", "")))

        page_title = f"DISRUPTION // {d_name} - OX500"
        description = f"OX500 disruption node: {d_name}. Contains {count} log pages."
        og_desc = f"DISRUPTION // {d_name} [{count}]"

        node_page = render(
            node_template,
            {
                "LANG": ctx.lang,
                "SYSTEM_CORE_START_UTC": esc(ctx.core_start),
                "SYS_VER": esc(ctx.sys_ver),
                "AVAILABLE_COUNT": ctx.available_count,
                "PAGE_TITLE": esc(page_title),
                "DESCRIPTION": esc(description),
                "CANONICAL": canonical,
                "OG_TITLE": esc(page_title),
                "OG_DESC": esc(og_desc),
                "OG_IMAGE": ctx.og_image,
                "JSONLD": jsonld_disruption_node(
                    ctx.base_url,
                    url_path,
                    d_name,
                    newest_date,
                    ctx.og_image,
                    ctx.github_repo,
                ),
                "H1": esc(f"DISRUPTION // {d_name} [{count}]"),
                "META": esc(f"OX500 // DISRUPTION_FEED | NODE | LOGS: {count}"),
                "CURRENT_LOG_ID": esc(d_logs[0]["id"]) if d_logs else "",
                "NODE_LOG_LIST": "\n".join(node_list),
                "YOUTUBE": ctx.youtube,
                "BANDCAMP": ctx.bandcamp,
                "GITHUB": ctx.github_repo,
                "BASE_URL": ctx.base_url,
                "ASSET_VERSION": ctx.asset_version,
            },
        )

        node_page = rewrite_css_links(node_page, ctx.base_url)
        write_text(DIST / rel_path, node_page)
        sitemap_entries.append((canonical, newest_date))


def compose_home_view_models(
    logs_sorted: list,
    disruptions: dict,
    disruption_order: list,
    ctx: SiteContext,
    rel,
    url,
    disruption_rel,
) -> dict:
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
        latest_log_id = esc(latest_log["id"])
        latest_log_date = esc(latest_log.get("date", ""))
        latest_log_text = format_log_text(latest_log.get("text", ""))
        latest_log_url = url(rel(latest_log))
        older_log = logs_sorted[1] if len(logs_sorted) > 1 else None
        if older_log:
            latest_log_prev_url = url(rel(older_log))
            latest_log_prev_attrs = ""
            previous_log_text_plain = " ".join(str(older_log.get("text", "")).split())

    blocks = []
    recent_logs = []
    disruption_nodes = []
    disruption_index_items = []
    disruptions_nav_payload = []

    for log in logs_sorted[:6]:
        up = url(rel(log))
        raw_title = str(log.get("title", ""))
        title = re.sub(r"^LOG\s+\d+\s*//\s*", "", raw_title, flags=re.IGNORECASE).strip()
        recent_logs.append(make_log_line_link(up, f'LOG {log["id"]}', title or raw_title, extra_class="naked"))

    for idx, d_slug in enumerate(disruption_order[:HOME_DISRUPTION_LIMIT]):
        d = disruptions[d_slug]
        d_name = d["name"]
        d_logs = d["logs"]
        count = len(d_logs)
        node_url = url(disruption_rel(d_slug))
        open_attr = " open" if idx == 0 else ""

        preview = []
        for log in d_logs[:HOME_DISRUPTION_PREVIEW_LOGS]:
            preview.append(make_log_line_link(url(rel(log)), f'LOG: {log["id"]}', log.get("title", "")))

        blocks.append(
            f'''<details class="log-entry"{open_attr}>
  <summary>
    <div class="log-entry-header">
      <span>{esc(f"DISRUPTION // {d_name} [{count}]")}</span>
      <span>NODE</span>
    </div>
  </summary>
  <div class="log-entry-body">
    <p><a href="{node_url}">OPEN NODE -></a></p>
    <div class="logs">
      {''.join(preview)}
    </div>
  </div>
</details>'''
        )

    for d_slug in disruption_order[:4]:
        d = disruptions[d_slug]
        d_name = d["name"]
        count = len(d["logs"])
        disruption_nodes.append(
            make_disruption_node_link(url(disruption_rel(d_slug)), d_name, count, extra_class="naked")
        )

    for d_slug in disruption_order:
        d = disruptions[d_slug]
        d_name = d["name"]
        count = len(d["logs"])
        node_url = url(disruption_rel(d_slug))
        disruptions_nav_payload.append({"name": d_name, "count": count, "url": node_url})
        if len(disruption_index_items) < DISRUPTION_INDEX_PAGE_SIZE:
            disruption_index_items.append(
                make_disruption_node_link(node_url, d_name, count, extra_class="disruption-archive-item")
            )

    disruption_series_parts = []
    for d_slug in disruption_order[:HOME_DISRUPTION_LIMIT]:
        d = disruptions[d_slug]
        d_name = d["name"]
        newest_date = d["logs"][0].get("date", utc_today_iso())
        node_url = url(disruption_rel(d_slug))
        disruption_series_parts.append(
            {
                "@type": "CreativeWork",
                "name": f"DISRUPTION // {d_name}",
                "url": f"{ctx.base_url}{node_url}",
                "datePublished": normalize_date(newest_date),
            }
        )

    disruption_series_jsonld = {
        "@context": "https://schema.org",
        "@type": "CreativeWorkSeries",
        "@id": f"{ctx.base_url}/#disruption-feed",
        "name": "OX500 Disruption Feed",
        "description": "Experimental poetry logs exploring AI compliance, decay, and system failure - linked to audio transmissions and album releases.",
        "inLanguage": ctx.lang,
        "url": f"{ctx.base_url}/",
        "publisher": {"@type": "Organization", "name": "OX500", "url": f"{ctx.base_url}/"},
        "hasPart": disruption_series_parts,
    }

    return {
        "latest_log_id": latest_log_id,
        "latest_log_date": latest_log_date,
        "latest_log_text": latest_log_text,
        "latest_log_url": latest_log_url,
        "latest_log_prev_url": latest_log_prev_url,
        "latest_log_next_url": latest_log_next_url,
        "latest_log_prev_attrs": latest_log_prev_attrs,
        "latest_log_next_attrs": latest_log_next_attrs,
        "previous_log_text_plain": previous_log_text_plain,
        "recent_logs": recent_logs,
        "blocks": blocks,
        "disruption_nodes": disruption_nodes,
        "disruption_index_items": disruption_index_items,
        "disruptions_nav_payload": disruptions_nav_payload,
        "disruption_series_jsonld": disruption_series_jsonld,
    }


def stage_export_json_data(logs_sorted: list, disruptions_nav_payload: list, rel, url) -> None:
    disruption_page_size = DISRUPTION_INDEX_PAGE_SIZE
    disruption_total_pages = (
        (len(disruptions_nav_payload) + disruption_page_size - 1) // disruption_page_size
        if disruptions_nav_payload
        else 0
    )
    for page_num in range(1, disruption_total_pages + 1):
        start = (page_num - 1) * disruption_page_size
        end = start + disruption_page_size
        write_text(
            DIST / "data" / f"disruptions-page-{page_num}.json",
            json.dumps(disruptions_nav_payload[start:end], ensure_ascii=False),
        )
    write_text(
        DIST / "data" / "disruptions-pages-meta.json",
        json.dumps(
            {
                "page_size": disruption_page_size,
                "total_pages": disruption_total_pages,
                "total_items": len(disruptions_nav_payload),
                "total_unique_disruptions": len(disruptions_nav_payload),
            },
            ensure_ascii=False,
        ),
    )

    logs_page_size = LOG_INDEX_PAGE_SIZE
    logs_nav_payload = []
    for log in logs_sorted:
        rel_path = rel(log)
        logs_nav_payload.append(
            {
                "id": str(log.get("id", "")),
                "title": str(log.get("title", "")),
                "date": str(log.get("date", "")),
                "slug": str(log.get("slug", "")),
                "url": url(rel_path),
                "tag": str(log.get("tag", "")),
                "series": str(log.get("series") or log.get("disruption") or ""),
                "text": str(log.get("text", "")),
                "excerpt": str(log.get("excerpt", "")),
            }
        )

    logs_total_pages = (
        (len(logs_nav_payload) + logs_page_size - 1) // logs_page_size
        if logs_nav_payload
        else 0
    )
    for page_num in range(1, logs_total_pages + 1):
        start = (page_num - 1) * logs_page_size
        end = start + logs_page_size
        write_text(
            DIST / "data" / f"logs-page-{page_num}.json",
            json.dumps(logs_nav_payload[start:end], ensure_ascii=False),
        )
    write_text(
        DIST / "data" / "logs-pages-meta.json",
        json.dumps(
            {
                "page_size": logs_page_size,
                "total_pages": logs_total_pages,
                "total_items": len(logs_nav_payload),
            },
            ensure_ascii=False,
        ),
    )


def stage_render_homepage(t_index: str, ctx: SiteContext, home_vm: dict) -> None:
    sensor_label = "SENSOR DRIFT VECTOR"
    sensor_code = derive_sensor_code(ctx.asset_version)

    index_html = render(
        t_index,
        {
            "LANG": ctx.lang,
            "SYSTEM_CORE_START_UTC": esc(ctx.core_start),
            "AVAILABLE_COUNT": ctx.available_count,
            "SYS_VER": esc(ctx.sys_ver),
            "BASE_URL": ctx.base_url,
            "CANONICAL": f"{ctx.base_url}/",
            "SITEMAP_URL": f"{ctx.base_url}/sitemap.xml",
            "SITE_TITLE": esc(ctx.site_title),
            "OG_IMAGE": ctx.og_image,
            "YOUTUBE": ctx.youtube,
            "BANDCAMP": ctx.bandcamp,
            "GITHUB": ctx.github_repo,
            "SENSOR_LABEL": sensor_label,
            "SENSOR_CODE": sensor_code,
            "RECENT_LOGS": "\n".join(home_vm["recent_logs"]),
            "DISRUPTION_NODES": "\n".join(home_vm["disruption_nodes"]),
            "DISRUPTION_SERIES_JSONLD": json.dumps(home_vm["disruption_series_jsonld"], ensure_ascii=False, indent=2),
            "CURRENT_LOG_ID": home_vm["latest_log_id"],
            "LATEST_LOG_ID": home_vm["latest_log_id"],
            "LATEST_LOG_DATE": home_vm["latest_log_date"],
            "LATEST_LOG_TEXT": home_vm["latest_log_text"],
            "LATEST_LOG_URL": home_vm["latest_log_url"],
            "LATEST_LOG_PREV_URL": home_vm["latest_log_prev_url"],
            "LATEST_LOG_NEXT_URL": home_vm["latest_log_next_url"],
            "LATEST_LOG_PREV_ATTRS": home_vm["latest_log_prev_attrs"],
            "LATEST_LOG_NEXT_ATTRS": home_vm["latest_log_next_attrs"],
            "PREVIOUS_LOG_TEXT_PLAIN": esc(home_vm["previous_log_text_plain"]),
            "ASSET_VERSION": ctx.asset_version,
        },
    )
    index_html = rewrite_css_links(index_html, ctx.base_url)
    write_text(DIST / "index.html", index_html)


def stage_build_home_and_exports(
    logs_sorted: list,
    disruptions: dict,
    disruption_order: list,
    t_index: str,
    ctx: SiteContext,
    rel,
    url,
    disruption_rel,
) -> None:
    home_vm = compose_home_view_models(
        logs_sorted=logs_sorted,
        disruptions=disruptions,
        disruption_order=disruption_order,
        ctx=ctx,
        rel=rel,
        url=url,
        disruption_rel=disruption_rel,
    )
    stage_export_json_data(
        logs_sorted=logs_sorted,
        disruptions_nav_payload=home_vm["disruptions_nav_payload"],
        rel=rel,
        url=url,
    )
    stage_render_homepage(t_index=t_index, ctx=ctx, home_vm=home_vm)


def stage_write_robots_and_sitemap(base_url: str, logs_sorted: list, sitemap_entries: list) -> None:
    write_text(
        DIST / "robots.txt",
        f"User-agent: *\nAllow: /\n\nSitemap: {base_url}/sitemap.xml\n",
    )

    if logs_sorted:
        homepage_lastmod = normalize_date(logs_sorted[0].get("date", utc_today_iso()))
    else:
        homepage_lastmod = utc_today_iso()

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        f"    <loc>{base_url}/</loc>",
        f"    <lastmod>{homepage_lastmod}</lastmod>",
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


def build():
    stage_prepare_output()
    source = stage_load_and_validate_source()
    site = source["site"]
    logs = source["logs"]

    # ===== NORMALIZE SLUGS =====
    for log in logs:
        log["slug"] = slugify(log.get("slug") or log.get("title", ""))

    # ===== FILTER OUT FUTURE-DATED LOGS (do not generate/publish yet) =====
    asset_version = compute_asset_version()
    today = utc_today()
    logs = [log for log in logs if log["_date_obj"] <= today]

    # newest first
    logs_sorted = sorted(logs, key=lambda x: x["_id_int"], reverse=True)
    generated_log_pages = len(logs_sorted)
    available_count = f"{generated_log_pages:04d}"
    t_log, t_index, t_node = stage_prepare_templates_and_css()

    ctx = SiteContext(
        base_url=site["base_url"].rstrip("/"),
        lang=site.get("default_lang", "en"),
        og_image=site["og_image"],
        youtube=site["youtube"],
        bandcamp=site.get("bandcamp", ""),
        github_repo=site.get("github", ""),
        core_start=source["core_start"],
        sys_ver=source["sys_ver"],
        site_title=site.get("site_title", "OX500 // CORE INTERFACE"),
        available_count=available_count,
        asset_version=asset_version,
    )

    sitemap_entries = []
    rel = make_log_rel_path
    url = make_url_path
    disruption_rel = make_disruption_rel_path

    disruptions, disruption_order = stage_group_disruptions(logs_sorted)

    stage_build_log_pages(
        logs_sorted=logs_sorted,
        t_log=t_log,
        ctx=ctx,
        rel=rel,
        url=url,
        disruption_rel=disruption_rel,
        sitemap_entries=sitemap_entries,
    )

    stage_build_disruption_pages(
        disruption_order=disruption_order,
        disruptions=disruptions,
        t_node=t_node,
        ctx=ctx,
        rel=rel,
        url=url,
        disruption_rel=disruption_rel,
        sitemap_entries=sitemap_entries,
    )

    stage_build_home_and_exports(
        logs_sorted=logs_sorted,
        disruptions=disruptions,
        disruption_order=disruption_order,
        t_index=t_index,
        ctx=ctx,
        rel=rel,
        url=url,
        disruption_rel=disruption_rel,
    )

    stage_write_robots_and_sitemap(ctx.base_url, logs_sorted, sitemap_entries)

    print("BUILD OK - index, logs, disruption nodes, logs pages json, sitemap, robots generated")


if __name__ == "__main__":
    build()
