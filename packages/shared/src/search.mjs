import { toToolName } from "./schema.mjs";

const DEFAULT_LIMIT = 20;

export function searchCatalog(catalog, args = {}, opts = {}) {
  const query = (args.query || "").toLowerCase().trim();
  const limit = opts.limit ?? args.limit ?? DEFAULT_LIMIT;
  const tier1Set = new Set(opts.tier1 || []);

  const all = Object.entries(catalog.commands).map(([key, cmd]) => {
    const tool_name = toToolName(key);
    const haystack = (cmd.description + " " + key).toLowerCase();
    let score = 0;
    if (query) {
      if (haystack.includes(query)) score += 10;
      if (key.toLowerCase().includes(query)) score += 5;
      // path length only acts as a tie-breaker when the query matched
      score -= cmd.path.length;
    } else {
      // empty query: list everything, tier1 ranks higher
      score = 100 - cmd.path.length;
    }
    if (tier1Set.has(tool_name)) score += 3;
    return {
      tool_name,
      path: cmd.path,
      description: cmd.description,
      _score: score,
    };
  });

  return all
    .filter((x) => x._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}
