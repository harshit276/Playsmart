/**
 * @module searchPrompts
 * Curated YouTube search prompts per sport for the labeling tool's
 * dataset-collection workflow. Each entry opens a YouTube Shorts /
 * highlights search; user pastes the picked video URL into ytshortsdl.io
 * to download an MP4, then uploads it back to /label.
 */

const PLAYERS = {
  badminton: [
    "Lin Dan", "Lee Chong Wei", "Viktor Axelsen", "Kento Momota",
    "PV Sindhu", "Saina Nehwal", "Carolina Marin", "Tai Tzu Ying",
    "Lakshya Sen", "HS Prannoy",
  ],
  tennis: [
    "Roger Federer", "Rafael Nadal", "Novak Djokovic", "Carlos Alcaraz",
    "Jannik Sinner", "Iga Swiatek", "Aryna Sabalenka", "Coco Gauff",
    "Serena Williams", "Daniil Medvedev",
  ],
  table_tennis: [
    "Ma Long", "Fan Zhendong", "Xu Xin", "Tomokazu Harimoto",
    "Sun Yingsha", "Chen Meng", "Sharath Kamal", "Manika Batra",
  ],
  pickleball: [
    "Ben Johns", "Anna Leigh Waters", "Tyson McGuffin",
    "Jay Devilliers", "Catherine Parenteau", "Federico Staksrud",
  ],
  cricket: [
    "Virat Kohli", "Rohit Sharma", "Babar Azam", "Steve Smith",
    "Joe Root", "Kane Williamson", "Jasprit Bumrah", "Shaheen Afridi",
    "MS Dhoni", "Sachin Tendulkar",
  ],
};

const SHOT_KEYWORDS = {
  badminton: [
    { label: "Smash", q: "smash slow motion" },
    { label: "Drop shot", q: "drop shot technique" },
    { label: "Clear", q: "clear shot rally" },
    { label: "Net shot", q: "net shot" },
    { label: "Drive", q: "drive shot rally" },
    { label: "Serve", q: "serve technique" },
    { label: "Defensive lift", q: "defensive lift" },
  ],
  tennis: [
    { label: "Forehand", q: "forehand slow motion" },
    { label: "Backhand", q: "backhand winner" },
    { label: "Serve", q: "serve ace slow motion" },
    { label: "Volley", q: "volley point" },
    { label: "Drop shot", q: "drop shot" },
    { label: "Overhead", q: "overhead smash" },
    { label: "Slice", q: "slice backhand" },
  ],
  table_tennis: [
    { label: "Forehand loop", q: "forehand loop slow motion" },
    { label: "Backhand loop", q: "backhand loop" },
    { label: "Serve", q: "serve technique" },
    { label: "Smash", q: "smash point" },
    { label: "Push", q: "push shot rally" },
    { label: "Chop", q: "chop defense" },
    { label: "Flick", q: "flick service receive" },
  ],
  pickleball: [
    { label: "Dink", q: "dink rally" },
    { label: "Drive", q: "drive third shot" },
    { label: "Drop", q: "third shot drop" },
    { label: "Volley", q: "volley point" },
    { label: "Serve", q: "serve technique" },
    { label: "Lob", q: "lob shot" },
  ],
  cricket: [
    { label: "Cover drive", q: "cover drive slow motion" },
    { label: "Pull shot", q: "pull shot six" },
    { label: "Hook shot", q: "hook shot" },
    { label: "Straight drive", q: "straight drive" },
    { label: "Square cut", q: "square cut boundary" },
    { label: "Sweep", q: "sweep shot" },
    { label: "Yorker", q: "yorker bowling slow motion" },
    { label: "Bouncer", q: "bouncer wicket" },
  ],
};

const RALLY_PROMPTS = {
  badminton: ["epic rally point", "longest rally", "doubles rally point"],
  tennis: ["epic rally", "longest rally", "match point rally"],
  table_tennis: ["incredible rally", "fastest rally"],
  pickleball: ["epic dink rally", "long rally point"],
  cricket: ["best boundary highlights", "wicket compilation"],
};

const YT_BASE = "https://www.youtube.com/results?search_query=";
const SHORTS_BASE = "https://www.youtube.com/results?sp=EgIYAQ%253D%253D&search_query="; // Shorts filter

/**
 * Build the curated prompt list for a sport.
 * @returns {Array<{group:string, label:string, url:string, shorts_url:string}>}
 */
export function buildSearchPrompts(sport) {
  const players = PLAYERS[sport] || [];
  const shots = SHOT_KEYWORDS[sport] || [];
  const rallies = RALLY_PROMPTS[sport] || [];
  const sportName = sport.replace("_", " ");

  const prompts = [];

  // Player × shot combinations (top players × top 3 shots)
  for (const player of players.slice(0, 6)) {
    for (const shot of shots.slice(0, 3)) {
      const q = `${player} ${shot.q}`;
      prompts.push({
        group: "Player shots",
        label: `${player} — ${shot.label}`,
        url: YT_BASE + encodeURIComponent(q),
        shorts_url: SHORTS_BASE + encodeURIComponent(q),
      });
    }
  }

  // Generic shot types (sport + shot)
  for (const shot of shots) {
    const q = `${sportName} ${shot.q}`;
    prompts.push({
      group: "Shot types",
      label: shot.label,
      url: YT_BASE + encodeURIComponent(q),
      shorts_url: SHORTS_BASE + encodeURIComponent(q),
    });
  }

  // Rally / highlight prompts
  for (const r of rallies) {
    const q = `${sportName} ${r}`;
    prompts.push({
      group: "Rallies & highlights",
      label: r.charAt(0).toUpperCase() + r.slice(1),
      url: YT_BASE + encodeURIComponent(q),
      shorts_url: SHORTS_BASE + encodeURIComponent(q),
    });
  }

  return prompts;
}

export const DOWNLOADER_URL = "https://ytshortsdl.io/";
