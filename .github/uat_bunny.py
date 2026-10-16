"""Bunny set-up and upload for the UAT environment (uat.clavoris.com), used by .github/workflows/deploy-uat.yml.

  python3 .github/uat_bunny.py setup   storage zone, pull zone, hostname, DNS record, certificate, cache rules
  python3 .github/uat_bunny.py upload  uploads the site (the workflow has already pointed app/config.js to UAT)
  python3 .github/uat_bunny.py purge   purges the UAT pull zone

Everything is looked up by name first, so re-runs change nothing that already exists. Production
(storage zone "clavoris", pull zone 6793540) is never read or written here.
"""
import json, os, sys, time, urllib.error, urllib.request
from pathlib import Path

KEY = os.environ["BUNNY_API_KEY"]
HOST = os.environ.get("UAT_HOST", "uat.clavoris.com")
ZONE = os.environ.get("UAT_ZONE", "clavoris-uat")
API = "https://api.bunny.net"
SKIP_DIRS = (".git/", ".github/", "supabase/", "design/")
SKIP_FILES = ("README.md",)


def call(method, path, body=None, base=API, key=None, data=None, ctype=None):
    headers = {"AccessKey": key or KEY, "accept": "application/json"}
    if body is not None:
        data, ctype = json.dumps(body).encode(), "application/json"
    if ctype:
        headers["content-type"] = ctype
    req = urllib.request.Request(base + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode() or ""
            status = r.status
    except urllib.error.HTTPError as e:
        txt, status = e.read().decode(), e.code
    try:
        return status, json.loads(txt) if txt.strip()[:1] in "{[" else txt
    except ValueError:
        return status, txt


def items(x):
    return x.get("Items", []) if isinstance(x, dict) else (x or [])


def storage_zone(create=False):
    st, zs = call("GET", "/storagezone")
    z = next((z for z in items(zs) if z.get("Name") == ZONE and not z.get("Deleted")), None)
    if not z and create:
        st, z = call("POST", "/storagezone", {"Name": ZONE, "Region": "DE", "ZoneTier": 0})
        print("Storage zone created:", st)
        if st not in (200, 201):
            sys.exit(f"Storage zone not created: HTTP {st} {str(z)[:300]}")
    if not z:
        sys.exit("Storage zone missing: run setup first")
    return z


def pull_zone(sz=None, create=False):
    st, ps = call("GET", "/pullzone?search=" + ZONE)
    p = next((p for p in items(ps) if p.get("Name") == ZONE), None)
    if not p and create:
        st, p = call("POST", "/pullzone", {"Name": ZONE, "OriginType": 2, "StorageZoneId": sz["Id"], "Type": 0})
        print("Pull zone created:", st)
        if st not in (200, 201):
            sys.exit(f"Pull zone not created: HTTP {st} {str(p)[:300]}")
    if not p:
        sys.exit("Pull zone missing: run setup first")
    st, full = call("GET", f"/pullzone/{p['Id']}")
    return full if st == 200 else p


def dns_record():
    """Adds uat CNAME -> clavoris-uat.b-cdn.net when clavoris.com is a Bunny DNS zone; otherwise says what to add."""
    target = ZONE + ".b-cdn.net"
    st, zs = call("GET", "/dnszone?perPage=1000")
    zone = next((z for z in items(zs) if str(z.get("Domain", "")).lower() == "clavoris.com"), None) if st == 200 else None
    if not zone:
        print(f"::warning::clavoris.com is not a Bunny DNS zone. Add at the DNS provider: CNAME {HOST} -> {target}")
        return False
    st, full = call("GET", f"/dnszone/{zone['Id']}")
    recs = full.get("Records", []) if st == 200 else zone.get("Records", [])
    print("Bunny DNS zone clavoris.com:", len(recs), "records:", ", ".join(sorted({f"{r.get('Name') or '@'}({r.get('Type')})" for r in recs})))
    if any(str(r.get("Name", "")).lower() == "uat" for r in recs):
        print("DNS record for uat exists")
        return True
    st, t = call("PUT", f"/dnszone/{zone['Id']}/records", {"Type": 2, "Ttl": 300, "Name": "uat", "Value": target})
    print("DNS CNAME uat ->", target, "created:", st, str(t)[:200])
    return st in (200, 201)


def hostname_and_certificate(p):
    names = [h.get("Value") for h in p.get("Hostnames", [])]
    if HOST not in names:
        st, t = call("POST", f"/pullzone/{p['Id']}/addHostname", {"Hostname": HOST})
        print("Hostname", HOST, "added:", st, str(t)[:200])
    has_cert = any(h.get("Value") == HOST and h.get("HasCertificate") for h in p.get("Hostnames", []))
    if not has_cert:
        for attempt in range(6):
            st, t = call("GET", "/pullzone/loadFreeCertificate?hostname=" + HOST)
            print("Certificate request:", st, str(t)[:200])
            if st in (200, 201, 204):
                has_cert = True
                break
            time.sleep(20)
    if has_cert:
        st, _ = call("POST", f"/pullzone/{p['Id']}/setForceSSL", {"Hostname": HOST, "ForceSSL": True})
        print("Force HTTPS:", st)
    else:
        print("::warning::No certificate yet for", HOST, "(DNS may still be propagating); the next run retries.")


def cache_rules(p):
    rules = p.get("EdgeRules", [])
    wanted = [
        ("UAT HTML: no browser cache", ["*.html", "*.html?*", "*/", f"https://{HOST}", f"https://{HOST}/app"], 16, "0", ""),
        ("UAT CSS/JS: no browser cache", ["*.css", "*.js", "*.css?*", "*.js?*"], 16, "0", ""),
        ("UAT: keep search engines out", ["*"], 5, "X-Robots-Tag", "noindex, nofollow"),
    ]
    for desc, patterns, action, p1, p2 in wanted:
        guid = next((r.get("Guid") for r in rules if r.get("Description") == desc), None)
        rule = {"ActionType": action, "ActionParameter1": p1, "ActionParameter2": p2, "Enabled": True, "Description": desc,
                "TriggerMatchingType": 0, "Triggers": [{"Type": 0, "PatternMatchingType": 0, "PatternMatches": patterns, "Parameter1": ""}]}
        if guid:
            rule["Guid"] = guid
        st, t = call("POST", f"/pullzone/{p['Id']}/edgerules/addOrUpdate", rule)
        print("Edge rule:", desc, st)


def setup():
    sz = storage_zone(create=True)
    p = pull_zone(sz, create=True)
    print(f"Storage zone {ZONE} id {sz['Id']}; pull zone id {p['Id']} ({ZONE}.b-cdn.net)")
    dns_record()
    hostname_and_certificate(p)
    cache_rules(p)


def upload():
    sz = storage_zone()
    password = sz.get("Password")
    region = (sz.get("Region") or "DE").upper()
    host = "storage.bunnycdn.com" if region == "DE" else f"{region.lower()}.storage.bunnycdn.com"
    count = 0
    for f in sorted(Path(".").rglob("*")):
        if not f.is_file():
            continue
        rel = f.as_posix()
        if rel.startswith(SKIP_DIRS) or rel in SKIP_FILES:
            continue
        st, t = call("PUT", f"/{ZONE}/{rel}", base=f"https://{host}", key=password, data=f.read_bytes(), ctype="application/octet-stream")
        if st not in (200, 201):
            sys.exit(f"Upload failed for {rel}: HTTP {st} {str(t)[:200]}")
        count += 1
    print("Uploaded", count, "files to", ZONE)


def purge():
    p = pull_zone()
    st, _ = call("POST", f"/pullzone/{p['Id']}/purgeCache")
    print("Cache purged:", st)


if __name__ == "__main__":
    {"setup": setup, "upload": upload, "purge": purge}[sys.argv[1]]()
