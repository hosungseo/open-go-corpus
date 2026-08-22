#!/usr/bin/env python3
"""Text extraction for every document format the portal serves.

open.go.kr hands back whatever the agency actually filed: PDF for the rendered
본문, but HWP/HWPX for the real working document, plus ODT, MHT, XLSX and the
occasional ZIP bundle. Attachments are usually the substantive artefact — a
27KB 본문 PDF often ships with a 1.3MB HWPX that holds the actual plan.

Usage:  python3 tools/extract.py <file> [...]
Prints extracted text to stdout (one document per call).
"""
import sys
import re
import zipfile
import subprocess
import tempfile
import os
from pathlib import Path

MAX = 400_000  # cap per document; nothing useful lives past this

# edwardkim/rhwp — Rust HWP engine. Handles HWP5 binary, HWPX and HML, keeps
# page and table layout (pyhwp flattens it), and can pull normalised dates and
# table cells straight out of the document. Used first for every HWP format.
RHWP = Path(__file__).resolve().parent.parent / "vendor" / "rhwp" / "rhwp"


def _rhwp(args, timeout=180):
    out = subprocess.run([str(RHWP), *args], capture_output=True, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError((out.stderr or b"").decode("utf-8", "ignore")[:160] or "rhwp failed")
    return out.stdout.decode("utf-8", "ignore")


def from_rhwp_text(p: Path) -> str:
    """Page-by-page text with layout preserved."""
    with tempfile.TemporaryDirectory() as td:
        _rhwp(["export-text", str(p), "-o", td])
        pages = sorted(Path(td).glob("*.txt"))
        if not pages:
            raise RuntimeError("rhwp produced no text")
        return "\n\n".join(f.read_text("utf-8", "ignore") for f in pages)


def rhwp_meta(p: Path) -> dict:
    """Normalised dates and table cells — the structured half of a report."""
    import json as _json
    meta = {}
    try:
        d = _json.loads(_rhwp(["extract-data", str(p), "--kind", "date", "--json"]))
        meta["dates"] = [
            {"raw": i.get("raw"), "date": i.get("normalized"), "page": i.get("page")}
            for i in d.get("items", [])
        ]
    except Exception:
        pass
    try:
        t = _json.loads(_rhwp(["export-tables", str(p), "--json"]))
        meta["tables"] = [
            {
                "rows": tb.get("rows"), "cols": tb.get("cols"),
                "cells": [c.get("text", "") for c in tb.get("cells", [])][:120],
            }
            for tb in t.get("tables", [])[:20]
        ]
    except Exception:
        pass
    return meta


def _xml_text(data: bytes) -> str:
    """Strip tags from an OOXML/HWPML part, keeping paragraph breaks."""
    s = data.decode("utf-8", "ignore")
    s = re.sub(r"<(?:w:p|hp:p|text:p|text:h)\b[^>]*/?>", "\n", s)
    s = re.sub(r"</(?:w:p|hp:p|text:p|text:h)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"').replace("&#13;", "")
    return s


def from_pdf(p: Path) -> str:
    from pypdf import PdfReader
    return "\n".join((pg.extract_text() or "") for pg in PdfReader(str(p)).pages)


def from_hwp(p: Path) -> str:
    try:
        return from_rhwp_text(p)
    except Exception:
        # pyhwp fallback: older HWP5 revisions rhwp declines to render.
        out = subprocess.run(["hwp5txt", str(p)], capture_output=True, timeout=120)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.decode("utf-8", "ignore")
        raise RuntimeError((out.stderr or b"").decode("utf-8", "ignore")[:120] or "hwp5txt failed")


def from_zip_xml(p: Path, parts) -> str:
    chunks = []
    with zipfile.ZipFile(p) as z:
        names = z.namelist()
        for pat in parts:
            for n in sorted(n for n in names if re.search(pat, n)):
                chunks.append(_xml_text(z.read(n)))
    return "\n".join(chunks)


def from_hwpx(p: Path) -> str:
    try:
        return from_rhwp_text(p)
    except Exception:
        # Raw fallback: HWPX is a ZIP; body text sits in Contents/section*.xml
        return from_zip_xml(p, [r"Contents/section\d*\.xml$", r"Contents/header\.xml$"])


def from_hml(p: Path) -> str:
    try:
        return from_rhwp_text(p)
    except Exception:
        return _xml_text(p.read_bytes())


def from_odt(p: Path) -> str:
    return from_zip_xml(p, [r"^content\.xml$"])


def from_xlsx(p: Path) -> str:
    return from_zip_xml(p, [r"xl/sharedStrings\.xml$", r"xl/worksheets/sheet\d+\.xml$"])


def from_docx(p: Path) -> str:
    return from_zip_xml(p, [r"word/document\.xml$"])


def from_mht(p: Path) -> str:
    import email
    from email import policy
    msg = email.message_from_bytes(p.read_bytes(), policy=policy.default)
    parts = []
    for part in msg.walk():
        if part.get_content_type() in ("text/html", "text/plain"):
            payload = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            txt = payload.decode(charset, "ignore")
            parts.append(re.sub(r"<[^>]+>", " ", txt))
    return "\n".join(parts)


def from_bundle(p: Path) -> str:
    """A ZIP of documents — extract each member with the right handler."""
    chunks = []
    with tempfile.TemporaryDirectory() as td, zipfile.ZipFile(p) as z:
        for n in z.namelist()[:40]:
            if n.endswith("/"):
                continue
            try:
                dest = Path(td) / Path(n).name
                dest.write_bytes(z.read(n))
                chunks.append(f"[{Path(n).name}]\n{extract(dest)}")
            except Exception:
                continue
    return "\n\n".join(chunks)


HANDLERS = {
    ".pdf": from_pdf, ".hwp": from_hwp, ".hwpx": from_hwpx, ".hwtx": from_hwpx,
    ".hml": from_hml, ".odt": from_odt, ".xlsx": from_xlsx, ".docx": from_docx,
    ".mht": from_mht, ".mhtml": from_mht, ".zip": from_bundle,
}
HWP_FORMATS = {".hwp", ".hwpx", ".hwtx", ".hml"}


def extract(path: Path) -> str:
    ext = path.suffix.lower()
    fn = HANDLERS.get(ext)
    if fn is None:
        raise RuntimeError(f"unsupported: {ext}")
    text = fn(path)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:MAX]


if __name__ == "__main__":
    import json as _json
    args = [a for a in sys.argv[1:] if a != "--meta"]
    want_meta = "--meta" in sys.argv[1:]
    outs, metas = [], {}
    for a in args:
        p = Path(a)
        try:
            outs.append(extract(p))
            if want_meta and p.suffix.lower() in HWP_FORMATS:
                metas[p.name] = rhwp_meta(p)
        except Exception as e:  # noqa: BLE001 — caller only needs the message
            print(f"__ERROR__ {p.name}: {e}", file=sys.stderr)
    if want_meta:
        print(_json.dumps({"text": "\n\n".join(o for o in outs if o), "meta": metas}, ensure_ascii=False))
    else:
        print("\n\n".join(o for o in outs if o))
