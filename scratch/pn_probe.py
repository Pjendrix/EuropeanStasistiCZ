"""Spike PN: vypíše strukturu dumpu Parltracku (klíče, 3 ukázky zkrácené). Jen průzkum, nic do data/."""
import io, json, sys, collections
import zstandard

def records(path):
    with open(path, "rb") as fh:
        r = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(fh), encoding="utf-8")
        for line in r:
            line = line.strip()
            if line in ("[", "]", ""):
                continue
            # Parltrack: první řádek začíná "[", další ",", poslední může končit "]"
            line = line.lstrip("[,")
            if line.endswith("]") and not line.endswith("}]"):
                pass
            if line.endswith("]"):
                try:
                    yield json.loads(line)
                    continue
                except json.JSONDecodeError:
                    line = line[:-1]
            yield json.loads(line)

def short(v, n=160):
    s = json.dumps(v, ensure_ascii=False)
    return s if len(s) <= n else s[:n] + "…"

if __name__ == "__main__":
    path = sys.argv[1]
    keys = collections.Counter(); n = 0; samples = []
    for rec in records(path):
        n += 1; keys.update(rec.keys())
        if n in (1, 1000, 50000): samples.append(rec)
    print("záznamů", n)
    print("klíče", dict(keys.most_common()))
    for s in samples:
        print("---"); [print(" ", k, "=", short(v)) for k, v in s.items()]
