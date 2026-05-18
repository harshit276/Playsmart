import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, Search } from "lucide-react";

/**
 * Venue autocomplete using OpenStreetMap Nominatim (free, no API key).
 *
 * Returns picked-place objects via `onSelect`:
 *   { name, city, country, lat, lng, display_name }
 *
 * Debounces queries (350ms) and caps to 1 in-flight request to stay within
 * Nominatim's "max 1 req/sec" policy. Falls back gracefully if the API is
 * unreachable — the user can still type a freeform venue name.
 */
export default function VenueAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Search sports venue, arena, court...",
  countryCode = "in",
  className = "",
}) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debounceRef = useRef();
  const abortRef = useRef();
  const containerRef = useRef();

  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    const q = (value || "").trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", q);
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "7");
        if (countryCode) url.searchParams.set("countrycodes", countryCode);
        const res = await fetch(url.toString(), {
          headers: { "Accept": "application/json" },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("Nominatim error");
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch (err) {
        if (err.name !== "AbortError") {
          // Fail-soft — let the user type freeform venue
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [value, countryCode]);

  const pick = (place) => {
    const addr = place.address || {};
    const venueName = addr.amenity || addr.leisure || addr.shop || addr.tourism
      || addr.building || place.name || (place.display_name || "").split(",")[0];
    const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || addr.state || "";
    onChange(venueName);
    onSelect?.({
      name: venueName,
      city,
      country: addr.country || "",
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      display_name: place.display_name,
    });
    setOpen(false);
    setResults([]);
  };

  const onKey = (e) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-9 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
          {results.map((r, i) => {
            const addr = r.address || {};
            const name = addr.amenity || addr.leisure || addr.shop || addr.tourism
              || addr.building || r.name || (r.display_name || "").split(",")[0];
            const sub = (r.display_name || "")
              .split(",").slice(1, 4).join(",").trim();
            const isHl = i === highlight;
            return (
              <button
                key={r.place_id || i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-2 border-b border-zinc-800 last:border-b-0 ${
                  isHl ? "bg-zinc-800" : "hover:bg-zinc-800/60"
                }`}
              >
                <MapPin className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{name}</p>
                  {sub && <p className="text-[11px] text-zinc-500 truncate">{sub}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && !loading && results.length === 0 && value?.length >= 3 && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5">
          <p className="text-xs text-zinc-500">
            No matches found. You can still type the venue name manually.
          </p>
        </div>
      )}
    </div>
  );
}
