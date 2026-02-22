import json
import os
import re
import shutil
import filecmp
import hashlib
import unicodedata
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import html

try:
    import minify_html as _minify_html
    _MINIFY_HTML_AVAILABLE = True
except ImportError:
    _MINIFY_HTML_AVAILABLE = False

# =========================================================
# CONFIG / CONSTANTS
# =========================================================
ROOT = Path(__file__).parent
DIST = ROOT / "dist"


# =========================================================
# JS BUNDLE CONFIG
# =========================================================
JS_ENTRY        = ROOT / "assets" / "js" / "main.js"
JS_BUNDLE_REL   = Path("assets") / "js" / "bundle.js"
JS_BUNDLE_DIST  = DIST / JS_BUNDLE_REL
JS_TARGET       = "es2020"          # safe for all modern browsers
JS_MINIFY       = True              # set False for easier debugging


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
    site_mode: str
    robots_meta: str

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
  {{ROBOTS_META}}

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

  <link rel="stylesheet" href="/assets/css/style.css?v={{ASSET_VERSION}}" />

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


def cleanup_disruption_text(raw_text: str) -> str:
    text = str(raw_text or "").strip()
    text = re.sub(r"^DISRUPTION(?:_SERIES)?\s*//\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^SERIES\s*//\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^DISRUPTION\s*/\s*", "", text, flags=re.IGNORECASE)
    return text.strip()


def derive_mobile_disruption_title(log: dict) -> str:
    clean = str(log.get("disruption_title_clean", "")).strip()
    if clean:
        return clean
    raw_series = str(log.get("series") or log.get("disruption") or "").strip()
    raw_title = re.sub(r"^LOG\s*\d+\s*//\s*", "", str(log.get("title", "")).strip(), flags=re.IGNORECASE)
    title = cleanup_disruption_text(raw_series) or raw_title
    return title or "UNTITLED"


def derive_mobile_log_entry_title(log: dict) -> str:
    title = re.sub(r"^LOG\s*\d+\s*//\s*", "", str(log.get("title", "")).strip(), flags=re.IGNORECASE)
    title = re.sub(r"^DISRUPTION(?:_SERIES)?\s*//\s*", "", title, flags=re.IGNORECASE)
    return title.strip() or "UNTITLED"


def read_text(path: Path) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if _MINIFY_HTML_AVAILABLE and path.suffix == ".html":
        try:
            content = _minify_html.minify(
                content,
                minify_js=False,
                minify_css=False,
                keep_closing_tags=True,
                keep_html_and_head_opening_tags=True,
            )
        except Exception:
            pass

    if (not CLEAN_DIST_ON_BUILD) and path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                if f.read() == content:
                    return
        except (OSError, UnicodeDecodeError):
            pass

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def load_home_inline_css() -> str:
    """
    Inline CSS for homepage to avoid a render-blocking CSS request on first paint.
    """
    css_path = ASSETS_CSS_DIST if ASSETS_CSS_DIST.exists() else (ASSETS_SRC / "css" / "style.css")
    css = read_text(css_path)
    css = re.sub(r"^\s*@charset\s+['\"][^'\"]+['\"]\s*;\s*", "", css, flags=re.IGNORECASE)
    return css.replace("</style", "<\\/style")


def copy_file_if_changed(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if CLEAN_DIST_ON_BUILD:
        shutil.copy2(src, dst)
        return
    if dst.exists():
        try:
            if filecmp.cmp(src, dst, shallow=False):
                return
        except (OSError, UnicodeDecodeError):
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
        f'<span class="log-id">//</span>'
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
def render(template: str, mapping: dict, template_name: str, context: str | None = None) -> str:
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        if key not in mapping:
            return match.group(0)
        value = mapping.get(key)
        return "" if value is None else str(value)

    out = TOKEN_RE.sub(_replace, template)
    if TOKEN_RE.search(out):
        unresolved = sorted(set(m.group(1) for m in TOKEN_RE.finditer(out)))
        message = f"Unresolved template tokens in '{template_name}': {unresolved}"
        if context:
            message = f"{message} | context: {context}"
        raise ValueError(message)
    return out


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
    seen_ids = {}
    for idx, log in enumerate(logs):
        ctx = f"logs[{idx}]"
        log_id_int = None

        try:
            log_id_int = parse_log_id_strict(log.get("id"), f"{ctx}.id")
        except ValueError as exc:
            errors.append(str(exc))
            continue

        if log_id_int in seen_ids:
            first_idx = seen_ids[log_id_int]
            errors.append(
                f"{ctx}.id: duplicate id '{log_id_int}' (first seen at logs[{first_idx}].id)"
            )
            continue
        seen_ids[log_id_int] = idx

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

def compute_next_log_utc(logs_sorted: list) -> str:
    now_utc = datetime.now(timezone.utc)
    nearest_future_utc = None
    nearest_future_raw = None

    for log in logs_sorted:
        raw_date = str(log.get("date", "")).strip()
        if not raw_date:
            continue
        if raw_date.endswith("Z"):
            raw_date = raw_date[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw_date)
        except Exception:
            continue

        if parsed.tzinfo is None:
            target_utc = parsed.replace(tzinfo=timezone.utc)
        else:
            target_utc = parsed.astimezone(timezone.utc)

        if target_utc <= now_utc:
            continue

        if nearest_future_utc is None or target_utc < nearest_future_utc:
            nearest_future_utc = target_utc
            nearest_future_raw = raw_date

    if nearest_future_utc is None:
        return "UNKNOWN"
    return nearest_future_raw


def extract_disruption_identity(log: dict) -> tuple[str, str]:
    """
    Returns normalized disruption title and slug from a log entry.
    Empty strings are returned when disruption/series is missing.
    """
    raw_disruption = str(log.get("series") or log.get("disruption") or "").strip()
    if not raw_disruption:
        return "", ""
    return disruption_display_name(raw_disruption), disruption_slug(raw_disruption)


def write_json(path: Path, payload) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False))


def iter_page_chunks(items: list, page_size: int):
    if page_size <= 0:
        raise ValueError("page_size must be positive")
    for start in range(0, len(items), page_size):
        page_num = (start // page_size) + 1
        yield page_num, items[start:start + page_size]


def write_paginated_json_files(items: list, page_size: int, file_prefix: str) -> int:
    total_pages = (len(items) + page_size - 1) // page_size if items else 0
    for page_num, chunk in iter_page_chunks(items, page_size):
        write_json(DIST / "data" / f"{file_prefix}-page-{page_num}.json", chunk)
    return total_pages



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
def jsonld_disruption_node(base_url, url_path, disruption_name, date, og_image, github_repo, log_items):
    canonical = f"{base_url}{url_path}"
    date = normalize_date(date)

    collection = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": f"{canonical}#collection",
        "name": f"DISRUPTION // {disruption_name}",
        "description": f"OX500 disruption node: {disruption_name}",
        "url": canonical,
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

    item_list = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": f"{canonical}#items",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": idx + 1,
                "url": item["url"],
                "name": item["name"],
            }
            for idx, item in enumerate(log_items)
        ],
    }

    breadcrumbs = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "OX500 Station", "item": f"{base_url}/"},
            {"@type": "ListItem", "position": 2, "name": f"DISRUPTION // {disruption_name}", "item": canonical},
        ],
    }

    return json.dumps([collection, item_list, breadcrumbs], ensure_ascii=False, indent=2)


def jsonld_log_creative_work(
    base_url: str,
    url_path: str,
    log_id: str,
    log_title: str,
    log_text: str,
    log_date: str,
    disruption_name: str,
    disruption_url: str,
    og_image: str,
) -> str:
    canonical = f"{base_url}{url_path}"
    description = first_line(log_text, 160)
    published = normalize_date(log_date) if str(log_date or "").strip() else utc_today_iso()

    article = {
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": f"{canonical}#post",
        "headline": f"LOG {log_id} // {log_title}",
        "description": description,
        "url": canonical,
        "mainEntityOfPage": canonical,
        "datePublished": published,
        "dateModified": published,
        "author": {"@type": "Organization", "name": "OX500"},
        "publisher": {"@type": "Organization", "name": "OX500"},
        "image": og_image,
        "isPartOf": {"@type": "CollectionPage", "name": f"DISRUPTION // {disruption_name}", "url": disruption_url},
        "articleSection": disruption_name,
    }

    breadcrumbs = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "OX500 Station", "item": f"{base_url}/"},
            {"@type": "ListItem", "position": 2, "name": f"DISRUPTION // {disruption_name}", "item": disruption_url},
            {"@type": "ListItem", "position": 3, "name": f"LOG {log_id}", "item": canonical},
        ],
    }

    return json.dumps([article, breadcrumbs], ensure_ascii=False, indent=2)


def make_recent_logs_markup(logs_sorted: list, rel, url, limit: int = 6) -> list[str]:
    recent_logs = []
    for log in logs_sorted[:limit]:
        up = url(rel(log))
        raw_title = str(log.get("title", ""))
        title = re.sub(r"^LOG\s+\d+\s*//\s*", "", raw_title, flags=re.IGNORECASE).strip()
        recent_logs.append(make_log_line_link(up, "//", title or raw_title, extra_class="naked"))
    return recent_logs


def make_disruption_nodes_markup(disruption_order: list, disruptions: dict, disruption_rel, url, limit: int = 4) -> list[str]:
    disruption_nodes = []
    for d_slug in disruption_order[:limit]:
        d = disruptions[d_slug]
        d_name = d["name"]
        count = len(d["logs"])
        disruption_nodes.append(
            make_disruption_node_link(url(disruption_rel(d_slug)), d_name, count, extra_class="naked")
        )
    return disruption_nodes


def register_seo_entry(seo_registry: dict, page_key: str, title: str, description: str, canonical: str) -> None:
    title = str(title or "").strip()
    description = str(description or "").strip()
    canonical = str(canonical or "").strip()

    if not title:
        raise ValueError(f"SEO validation failed ({page_key}): empty title")
    if not description:
        raise ValueError(f"SEO validation failed ({page_key}): empty description")
    if not canonical:
        raise ValueError(f"SEO validation failed ({page_key}): empty canonical")

    for field, value in (("title", title), ("description", description), ("canonical", canonical)):
        seen = seo_registry[field]
        prev = seen.get(value)
        if prev and prev != page_key:
            raise ValueError(
                f"SEO validation failed: duplicate {field} between '{prev}' and '{page_key}' -> {value}"
            )
        seen[value] = page_key


def audit_seo_heuristics(
    warnings: list[str],
    infos: list[str],
    page_key: str,
    title: str,
    description: str,
    canonical: str,
    og_title: str,
    og_description: str,
    og_url: str,
    og_image: str,
) -> None:
    title_len = len(str(title or "").strip())
    desc_len = len(str(description or "").strip())
    canonical_str = str(canonical or "").strip()
    og_title_str = str(og_title or "").strip()
    og_desc_str = str(og_description or "").strip()
    og_url_str = str(og_url or "").strip()
    og_image_str = str(og_image or "").strip()

    if title_len < 30:
        warnings.append(
            f"[SEO WARNING] {page_key} | title length={title_len} (recommended >=30)"
        )
    elif title_len < 45:
        infos.append(
            f"[SEO INFO] {page_key} | title length={title_len} (recommended 45-65)"
        )
    elif title_len <= 65:
        pass
    elif title_len <= 75:
        infos.append(
            f"[SEO INFO] {page_key} | title length={title_len} (recommended 45-65)"
        )
    else:
        warnings.append(
            f"[SEO WARNING] {page_key} | title length={title_len} (recommended <=75)"
        )

    if desc_len < 70:
        warnings.append(
            f"[SEO WARNING] {page_key} | description length={desc_len} (recommended >=70)"
        )
    elif desc_len < 120:
        infos.append(
            f"[SEO INFO] {page_key} | description length={desc_len} (recommended 120-165)"
        )
    elif desc_len <= 165:
        pass
    elif desc_len <= 200:
        infos.append(
            f"[SEO INFO] {page_key} | description length={desc_len} (recommended 120-165)"
        )
    else:
        warnings.append(
            f"[SEO WARNING] {page_key} | description length={desc_len} (recommended <=200)"
        )

    if not og_title_str:
        warnings.append(f"[SEO WARNING] {page_key} | missing og:title")
    if not og_desc_str:
        warnings.append(f"[SEO WARNING] {page_key} | missing og:description")
    if not og_image_str:
        warnings.append(f"[SEO WARNING] {page_key} | missing og:image")

    if canonical_str and not canonical_str.startswith("https://"):
        warnings.append(
            f"[SEO WARNING] {page_key} | canonical is not https ({canonical_str})"
        )
    if canonical_str and og_url_str and canonical_str != og_url_str:
        warnings.append(
            f"[SEO WARNING] {page_key} | og:url mismatch canonical | canonical={canonical_str} | og:url={og_url_str}"
        )

# =========================================================
# BUILD STAGES
# =========================================================

def _find_esbuild() -> str | None:
    """Find the esbuild executable, handling Windows (.cmd) and Unix variants."""
    import shutil

    candidates = ["esbuild", "esbuild.cmd"] if sys.platform == "win32" else ["esbuild"]
    for exe in candidates:
        if shutil.which(exe):
            return exe

    local_suffix = "esbuild.cmd" if sys.platform == "win32" else "esbuild"
    local = ROOT / "node_modules" / ".bin" / local_suffix
    if local.exists():
        return str(local)

    return None


def run_checked_process(cmd: list[str], *, error_label: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            cwd=ROOT,
            shell=(sys.platform == "win32"),
        )
    except subprocess.CalledProcessError as exc:
        print(f"ERROR: {error_label}:\n{exc.stderr}", file=sys.stderr)
        sys.exit(1)


def stage_minify_css() -> None:
    css_main = ASSETS_SRC / "css" / "style.css"
    css_core = ASSETS_SRC / "css" / "style-core.css"
    css_entry = ASSETS_SRC / "css" / "style-core.entry.css"
    css_src = css_entry if css_entry.exists() else (css_core if css_core.exists() else css_main)
    css_dst = ASSETS_CSS_DIST

    if not css_src.exists():
        print(f"SKIP CSS minify — not found: {css_src}")
        return

    css_dst.parent.mkdir(parents=True, exist_ok=True)

    run_checked_process(
        ["node", "node_modules/esbuild/bin/esbuild",
         str(css_src),
         "--bundle",
         "--external:*.woff2",
         "--minify",
         f"--outfile={css_dst}"],
        error_label="CSS minify failed",
    )
    size_kb = css_dst.stat().st_size / 1024
    print(f"CSS minify OK — {ASSETS_CSS_REL.as_posix()} ({size_kb:.1f} kB)")


def stage_bundle_js() -> None:
    """Bundle assets/js/main.js → dist/assets/js/bundle.js via esbuild."""
    if not JS_ENTRY.exists():
        print(f"SKIP JS bundle — entry not found: {JS_ENTRY}")
        return

    JS_BUNDLE_DIST.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "node",
        "node_modules/esbuild/bin/esbuild",
        str(JS_ENTRY),
        "--bundle",
        f"--outfile={JS_BUNDLE_DIST}",
        f"--target={JS_TARGET}",
        "--format=iife",
        "--platform=browser",
    ]

    if JS_MINIFY:
        cmd.append("--minify")

    result = run_checked_process(cmd, error_label="esbuild failed")
    size_kb = JS_BUNDLE_DIST.stat().st_size / 1024
    print(f"JS bundle OK — {JS_BUNDLE_REL.as_posix()} ({size_kb:.1f} kB)")
    if result.stderr:
        print(result.stderr.strip())


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
        css_dist_dir = ASSETS_DIST / "css"
        if css_dist_dir.exists():
            shutil.rmtree(css_dist_dir)
        css_dist_dir.mkdir(parents=True, exist_ok=True)

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

    logs_by_id = sorted(logs, key=lambda item: item["_id_int"])
    for i in range(1, len(logs_by_id)):
        prev_log = logs_by_id[i - 1]
        curr_log = logs_by_id[i]
        if curr_log["_date_obj"] < prev_log["_date_obj"]:
            raise ValueError(
                "Build aborted. Date consistency error by id order: "
                f"id {prev_log['id']} ({prev_log.get('date', '')}) -> "
                f"id {curr_log['id']} ({curr_log.get('date', '')})"
            )

    path_owner = {}
    for log in logs:
        effective_slug = slugify(log.get("slug") or log.get("title", ""))
        log_for_path = dict(log)
        log_for_path["slug"] = effective_slug
        rel_path = make_log_rel_path(log_for_path)
        existing = path_owner.get(rel_path)
        if existing is not None:
            raise ValueError(
                "Build aborted. Log output path collision for "
                f"'{rel_path.as_posix()}': "
                f"id={existing['id']} date={existing.get('date', '')} slug={existing['slug']} "
                f"collides with "
                f"id={log.get('id', '')} date={log.get('date', '')} slug={effective_slug}"
            )
        path_owner[rel_path] = {
            "id": str(log.get("id", "")),
            "date": str(log.get("date", "")),
            "slug": effective_slug,
        }

    return {
        "site": site,
        "core_start": core_start,
        "sys_ver": sys_ver,
        "logs": logs,
    }


def stage_load_templates():
    t_log = read_text(ROOT / "template-log.html")
    t_index = read_text(ROOT / "template-index.html")

    t_node_path = ROOT / "template-disruption.html"
    t_node = read_text(t_node_path) if t_node_path.exists() else None

    t_series_path = ROOT / "template-series.html"
    if t_node is None and t_series_path.exists():
        t_node = read_text(t_series_path)

    return t_log, t_index, t_node


def stage_prepare_templates_and_css():
    # Backward-compatible wrapper for the previous stage name.
    return stage_load_templates()


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
    disruptions: dict,
    disruption_order: list,
    t_log: str,
    ctx: SiteContext,
    next_log_utc: str,
    seo_registry: dict,
    seo_warnings: list[str],
    seo_infos: list[str],
    rel,
    url,
    disruption_rel,
    sitemap_entries: list,
) -> None:
    def nav_text(prefix: str, target_log: dict) -> str:
        if not SHOW_PREV_NEXT_TITLES_IN_TEXT:
            return prefix
        return f'{prefix}: {target_log.get("title", "").strip()}'

    recent_logs_markup = make_recent_logs_markup(logs_sorted, rel, url)
    disruption_nodes_markup = make_disruption_nodes_markup(disruption_order, disruptions, disruption_rel, url)
    sensor_label = "SENSOR DRIFT VECTOR"
    sensor_code = derive_sensor_code(ctx.asset_version)

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

        disruption_name, disruption_slug_value = extract_disruption_identity(log)
        node_meta = ""
        if disruption_slug_value:
            d_path = url(disruption_rel(disruption_slug_value))
            node_meta = f'NODE: <a href="{d_path}" rel="up">{esc(disruption_name)}</a> | '

        ui_state = log.get("ui_state") if isinstance(log.get("ui_state"), dict) else {}
        log_mode = str(ui_state.get("mode") or "READ_ONLY")
        log_state = str(ui_state.get("status") or "SYSTEM_PARTIAL")
        entry_title = derive_mobile_log_entry_title(log)
        disruption_label = derive_mobile_disruption_title(log)
        seo_title = f"LOG {log['id']} // {entry_title} | OX500"
        seo_description = first_line(f"DISRUPTION {disruption_label}. {log.get('text', '')}", 155)
        previous_log_text_plain = " ".join(str(prev_log.get("text", "")).split()) if prev_log else ""
        latest_log_prev_url = url(rel(prev_log)) if prev_log else ""
        latest_log_prev_attrs = "" if prev_log else 'aria-disabled="true" tabindex="-1"'
        disruption_url = canonical
        if disruption_slug_value:
            disruption_url = f"{ctx.base_url}{url(disruption_rel(disruption_slug_value))}"

        register_seo_entry(
            seo_registry,
            page_key=f"log:{log['id']}",
            title=seo_title,
            description=seo_description,
            canonical=canonical,
        )
        audit_seo_heuristics(
            warnings=seo_warnings,
            infos=seo_infos,
            page_key=f"log:{log['id']}",
            title=seo_title,
            description=seo_description,
            canonical=canonical,
            og_title=seo_title,
            og_description=seo_description,
            og_url=canonical,
            og_image=ctx.og_image,
        )

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
                "JSONLD": jsonld_log_creative_work(
                    ctx.base_url,
                    url_path,
                    str(log["id"]),
                    entry_title,
                    str(log.get("text", "")),
                    str(log.get("date", "")),
                    disruption_label,
                    disruption_url,
                    ctx.og_image,
                ),
                "LOG_ID": esc(log["id"]),
                "LOG_TITLE": esc(log["title"]),
                "LOG_DATE": esc(log.get("date", "")),
                "LOG_TEXT": format_log_text(log.get("text", "")),
                "RECENT_LOGS": "\n".join(recent_logs_markup),
                "DISRUPTION_NODES": "\n".join(disruption_nodes_markup),
                "NEXT_LOG_UTC": next_log_utc,
                "LATEST_LOG_DISRUPTION_TITLE": esc(disruption_label),
                "LATEST_LOG_ENTRY_TITLE": esc(entry_title),
                "LATEST_LOG_URL": url_path,
                "LATEST_LOG_PREV_URL": latest_log_prev_url,
                "LATEST_LOG_PREV_ATTRS": latest_log_prev_attrs,
                "PREVIOUS_LOG_TEXT_PLAIN": esc(previous_log_text_plain),
                "SYSTEM_CORE_START_UTC": esc(ctx.core_start),
                "AVAILABLE_COUNT": ctx.available_count,
                "SYS_VER": esc(ctx.sys_ver),
                "SENSOR_LABEL": sensor_label,
                "SENSOR_CODE": sensor_code,
                "SYSTEM_AGE_DAYS_AT_EVENT": esc(log.get("system_age_days_at_event", "")),
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
                "ROBOTS_META": ctx.robots_meta,
            },
            template_name="template-log.html",
            context=f"log_id={log['id']} output={rel_path.as_posix()}",
        )

        page = rewrite_css_links(page, ctx.base_url)
        write_text(DIST / rel_path, page)
        sitemap_entries.append((canonical, log.get("date", "")))


def stage_build_disruption_pages(
    logs_sorted: list,
    disruption_order: list,
    disruptions: dict,
    t_node: str,
    ctx: SiteContext,
    next_log_utc: str,
    seo_registry: dict,
    seo_warnings: list[str],
    seo_infos: list[str],
    rel,
    url,
    disruption_rel,
    sitemap_entries: list,
) -> None:
    node_template = t_node or FALLBACK_DISRUPTION_TEMPLATE
    if t_node:
        if (ROOT / "template-disruption.html").exists():
            node_template_name = "template-disruption.html"
        elif (ROOT / "template-series.html").exists():
            node_template_name = "template-series.html"
        else:
            node_template_name = "template-disruption-inline"
    else:
        node_template_name = "FALLBACK_DISRUPTION_TEMPLATE"

    recent_logs_markup = make_recent_logs_markup(logs_sorted, rel, url)
    disruption_nodes_markup = make_disruption_nodes_markup(disruption_order, disruptions, disruption_rel, url)
    sensor_label = "SENSOR DRIFT VECTOR"
    sensor_code = derive_sensor_code(ctx.asset_version)

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

        active_log = d_logs[0] if d_logs else {}
        active_log_id = str(active_log.get("id", ""))
        active_log_date = str(active_log.get("date", ""))
        active_log_title = derive_mobile_log_entry_title(active_log) if active_log else "UNTITLED"
        active_log_text = format_log_text(active_log.get("text", "")) if active_log else ""

        page_title = f"DISRUPTION // {d_name} [{count}] | OX500"
        description = first_line(
            f"Disruption node {d_name} with {count} logs. Latest LOG {active_log_id}: {active_log.get('text', '')}",
            155,
        )
        og_desc = description
        register_seo_entry(
            seo_registry,
            page_key=f"disruption:{d_slug}",
            title=page_title,
            description=description,
            canonical=canonical,
        )
        audit_seo_heuristics(
            warnings=seo_warnings,
            infos=seo_infos,
            page_key=f"disruption:{d_slug}",
            title=page_title,
            description=description,
            canonical=canonical,
            og_title=page_title,
            og_description=og_desc,
            og_url=canonical,
            og_image=ctx.og_image,
        )

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
                    log_items=[
                        {
                            "name": f'LOG {log["id"]} // {derive_mobile_log_entry_title(log)}',
                            "url": f'{ctx.base_url}{url(rel(log))}',
                        }
                        for log in d_logs[:50]
                    ],
                ),
                "H1": esc(f"DISRUPTION // {d_name} [{count}]"),
                "META": esc(f"OX500 // DISRUPTION_FEED | NODE | LOGS: {count}"),
                "CURRENT_LOG_ID": esc(active_log_id),
                "ACTIVE_LOG_ID": esc(active_log_id),
                "ACTIVE_LOG_DATE": esc(active_log_date),
                "ACTIVE_LOG_TEXT": active_log_text,
                "ACTIVE_DISRUPTION_TITLE": esc(d_name),
                "ACTIVE_LOG_ENTRY_TITLE": esc(active_log_title),
                "DISRUPTION_LOG_COUNT": esc(str(count)),
                "NODE_LOG_LIST": "\n".join(node_list),
                "RECENT_LOGS": "\n".join(recent_logs_markup),
                "DISRUPTION_NODES": "\n".join(disruption_nodes_markup),
                "NEXT_LOG_UTC": next_log_utc,
                "YOUTUBE": ctx.youtube,
                "BANDCAMP": ctx.bandcamp,
                "GITHUB": ctx.github_repo,
                "BASE_URL": ctx.base_url,
                "SENSOR_LABEL": sensor_label,
                "SENSOR_CODE": sensor_code,
                "ASSET_VERSION": ctx.asset_version,
                "ROBOTS_META": ctx.robots_meta,
            },
            template_name=node_template_name,
            context=f"disruption_slug={d_slug} output={rel_path.as_posix()}",
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
    latest_log_disruption_title = ""
    latest_log_entry_title = ""
    latest_log_url = ""
    latest_log_prev_url = ""
    latest_log_prev_attrs = 'aria-disabled="true" tabindex="-1"'
    previous_log_text_plain = ""

    if latest_log:
        latest_log_id = esc(latest_log["id"])
        latest_log_date = esc(latest_log.get("date", ""))
        latest_log_text = format_log_text(latest_log.get("text", ""))
        latest_log_disruption_title = esc(derive_mobile_disruption_title(latest_log))
        latest_log_entry_title = esc(derive_mobile_log_entry_title(latest_log))
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
        recent_logs.append(make_log_line_link(up, "//", title or raw_title, extra_class="naked"))

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
        disruptions_nav_payload.append({"name": d_name, "count": count, "url": node_url, "slug": d_slug})
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
        "latest_log_disruption_title": latest_log_disruption_title,
        "latest_log_entry_title": latest_log_entry_title,
        "latest_log_url": latest_log_url,
        "latest_log_prev_url": latest_log_prev_url,
        "latest_log_prev_attrs": latest_log_prev_attrs,
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
    disruption_total_pages = write_paginated_json_files(
        items=disruptions_nav_payload,
        page_size=disruption_page_size,
        file_prefix="disruptions",
    )
    write_json(
        DIST / "data" / "disruptions-pages-meta.json",
        {
            "page_size": disruption_page_size,
            "total_pages": disruption_total_pages,
            "total_items": len(disruptions_nav_payload),
            "total_unique_disruptions": len(disruptions_nav_payload),
        },
    )

    logs_page_size = LOG_INDEX_PAGE_SIZE
    logs_nav_payload = []
    for log in logs_sorted:
        rel_path = rel(log)
        disruption_title_clean, disruption_slug_clean = extract_disruption_identity(log)
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
                "disruption_title_clean": disruption_title_clean,
                "disruption_slug_clean": disruption_slug_clean,
            }
        )

    logs_total_pages = write_paginated_json_files(
        items=logs_nav_payload,
        page_size=logs_page_size,
        file_prefix="logs",
    )
    write_json(
        DIST / "data" / "logs-pages-meta.json",
        {
            "page_size": logs_page_size,
            "total_pages": logs_total_pages,
            "total_items": len(logs_nav_payload),
        },
    )


def stage_render_homepage(
    t_index: str,
    ctx: SiteContext,
    home_vm: dict,
    next_log_utc: str,
    seo_registry: dict,
    seo_warnings: list[str],
    seo_infos: list[str],
) -> None:
    sensor_label = "SENSOR DRIFT VECTOR"
    sensor_code = derive_sensor_code(ctx.asset_version)
    inline_css_home = load_home_inline_css()
    home_title = f"{ctx.site_title} // STATION"
    home_description = "OX500 STATION - system interface. Archive access is conditional. The logs remain."
    home_canonical = f"{ctx.base_url}/"

    register_seo_entry(
        seo_registry,
        page_key="home:/",
        title=home_title,
        description=home_description,
        canonical=home_canonical,
    )
    audit_seo_heuristics(
        warnings=seo_warnings,
        infos=seo_infos,
        page_key="home:/",
        title=home_title,
        description=home_description,
        canonical=home_canonical,
        og_title=home_title,
        og_description="System interface. Archive access is conditional. The logs remain.",
        og_url=home_canonical,
        og_image=ctx.og_image,
    )

    index_html = render(
        t_index,
        {
            "LANG": ctx.lang,
            "SYSTEM_CORE_START_UTC": esc(ctx.core_start),
            "AVAILABLE_COUNT": ctx.available_count,
            "SYS_VER": esc(ctx.sys_ver),
            "BASE_URL": ctx.base_url,
            "CANONICAL": home_canonical,
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
            "LATEST_LOG_DISRUPTION_TITLE": home_vm["latest_log_disruption_title"],
            "LATEST_LOG_ENTRY_TITLE": home_vm["latest_log_entry_title"],
            "LATEST_LOG_URL": home_vm["latest_log_url"],
            "LATEST_LOG_PREV_URL": home_vm["latest_log_prev_url"],
            "LATEST_LOG_PREV_ATTRS": home_vm["latest_log_prev_attrs"],
            "PREVIOUS_LOG_TEXT_PLAIN": esc(home_vm["previous_log_text_plain"]),
            "NEXT_LOG_UTC": next_log_utc,
            "ASSET_VERSION": ctx.asset_version,
            "INLINE_CSS_HOME": inline_css_home,
            "ROBOTS_META": ctx.robots_meta,
        },
        template_name="template-index.html",
        context="output=index.html",
    )
    index_html = rewrite_css_links(index_html, ctx.base_url)
    write_text(DIST / "index.html", index_html)


def stage_build_home_and_exports(
    logs_sorted: list,
    disruptions: dict,
    disruption_order: list,
    t_index: str,
    ctx: SiteContext,
    next_log_utc: str,
    seo_registry: dict,
    seo_warnings: list[str],
    seo_infos: list[str],
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
    stage_render_homepage(
        t_index=t_index,
        ctx=ctx,
        home_vm=home_vm,
        next_log_utc=next_log_utc,
        seo_registry=seo_registry,
        seo_warnings=seo_warnings,
        seo_infos=seo_infos,
    )


def stage_write_robots_and_sitemap(base_url: str, logs_sorted: list, sitemap_entries: list, site_mode: str) -> None:
    robots_lines = ["User-agent: *"]
    if site_mode == "prod":
        robots_lines.append("Allow: /")
        if base_url:
            robots_lines.append(f"Sitemap: {base_url}/sitemap.xml")
    else:
        robots_lines.append("Disallow: /")
        if base_url:
            robots_lines.append(f"Sitemap: {base_url}/sitemap.xml")
    write_text(DIST / "robots.txt", "\n".join(robots_lines) + "\n")

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
    site_mode = str(os.environ.get("SITE_MODE", "test")).strip().lower()
    if site_mode not in {"test", "prod"}:
        print(f"WARN: unsupported SITE_MODE='{site_mode}', defaulting to test")
        site_mode = "test"
    robots_meta = (
        '<meta name="robots" content="index, follow" />\n'
        '  <meta name="googlebot" content="index, follow" />'
        if site_mode == "prod"
        else '<meta name="robots" content="noindex, nofollow, noarchive" />\n'
             '  <meta name="googlebot" content="noindex, nofollow, noarchive" />'
    )
    stage_minify_css()
    stage_bundle_js()
    source = stage_load_and_validate_source()
    site = source["site"]
    logs = source["logs"]

    # ===== NORMALIZE SLUGS =====
    for log in logs:
        log["slug"] = slugify(log.get("slug") or log.get("title", ""))

    logs_sorted_all = sorted(logs, key=lambda x: x["_id_int"], reverse=True)
    next_log_utc = compute_next_log_utc(logs_sorted_all)

    # ===== FILTER OUT FUTURE-DATED LOGS (do not generate/publish yet) =====
    asset_version = compute_asset_version()
    today = utc_today()
    logs = [log for log in logs if log["_date_obj"] <= today]

    # newest first
    logs_sorted = sorted(logs, key=lambda x: x["_id_int"], reverse=True)
    generated_log_pages = len(logs_sorted)
    available_count = f"{generated_log_pages:04d}"
    t_log, t_index, t_node = stage_load_templates()

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
        site_mode=site_mode,
        robots_meta=robots_meta,
    )

    sitemap_entries = []
    seo_registry = {"title": {}, "description": {}, "canonical": {}}
    seo_warnings: list[str] = []
    seo_infos: list[str] = []
    rel = make_log_rel_path
    url = make_url_path
    disruption_rel = make_disruption_rel_path

    disruptions, disruption_order = stage_group_disruptions(logs_sorted)

    stage_build_log_pages(
        logs_sorted=logs_sorted,
        disruptions=disruptions,
        disruption_order=disruption_order,
        t_log=t_log,
        ctx=ctx,
        next_log_utc=next_log_utc,
        seo_registry=seo_registry,
        seo_warnings=seo_warnings,
        seo_infos=seo_infos,
        rel=rel,
        url=url,
        disruption_rel=disruption_rel,
        sitemap_entries=sitemap_entries,
    )

    stage_build_disruption_pages(
        logs_sorted=logs_sorted,
        disruption_order=disruption_order,
        disruptions=disruptions,
        t_node=t_node,
        ctx=ctx,
        next_log_utc=next_log_utc,
        seo_registry=seo_registry,
        seo_warnings=seo_warnings,
        seo_infos=seo_infos,
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
        next_log_utc=next_log_utc,
        seo_registry=seo_registry,
        seo_warnings=seo_warnings,
        seo_infos=seo_infos,
        rel=rel,
        url=url,
        disruption_rel=disruption_rel,
    )

    stage_write_robots_and_sitemap(ctx.base_url, logs_sorted, sitemap_entries, ctx.site_mode)

    if seo_warnings:
        for warning in seo_warnings:
            print(warning)
        print(f"SEO warnings: {len(seo_warnings)}")
    else:
        print("SEO warnings: 0")
    if seo_infos:
        for info in seo_infos:
            print(info)
        print(f"SEO info: {len(seo_infos)}")
    else:
        print("SEO info: 0")

    print("BUILD OK — index, logs, disruption nodes, logs pages json, sitemap, robots, JS bundle generated")


if __name__ == "__main__":
    build()
