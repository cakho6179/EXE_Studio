"""Script tam: soi cheo route backend vs FE usage."""
import re
import pathlib

BACKEND = pathlib.Path(__file__).parent
FE = BACKEND.parent / "frontend" / "src"

routes = []
for f in sorted((BACKEND / "app" / "api" / "v1").glob("*.py")):
    src = f.read_text(encoding="utf-8")
    for m in re.finditer(r'@router\.(get|post|patch|delete|put)\(\s*["\']([^"\']*)', src):
        routes.append((m.group(1).upper(), m.group(2), f.name))

fe_text = []
for p in FE.rglob("*"):
    if p.suffix in (".jsx", ".js") and p.is_file():
        try:
            fe_text.append(p.read_text(encoding="utf-8"))
        except Exception:
            pass
fe = "\n".join(fe_text)

print("=== ROUTE / SEGMENT CHUA DUOC FE GOI ===")
unused = []
for verb, path, fname in routes:
    seg = re.sub(r"\{[^}]*\}", "", path).strip("/").split("/")[0]
    if not seg:
        continue
    if seg not in fe:
        unused.append((verb, path, fname))
for u in unused:
    print(u)
print(f"Tong so route: {len(routes)} | Segments chua dung: {len(unused)}")
