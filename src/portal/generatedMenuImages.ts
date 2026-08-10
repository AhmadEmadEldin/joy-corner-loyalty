export type MenuImageSource = "generated" | "owner" | "placeholder";

export type ResolvedMenuImage = {
  src: string;
  source: MenuImageSource;
};

const PRODUCT_IMAGES: Record<string, string> = {
  "american black": "/assets/menu/board-crops/hot-beverages/americano.avif",
  americano: "/assets/menu/board-crops/hot-beverages/americano.avif",
  cappuccino: "/assets/menu/board-crops/hot-beverages/cappuccino.avif",
  "corto classic": "/assets/menu/board-crops/hot-beverages/cortado.avif",
  cortado: "/assets/menu/board-crops/hot-beverages/cortado.avif",
  espresso: "/assets/menu/board-crops/hot-beverages/espresso.avif",
  "espresso affogato": "/assets/menu/generated/hot-beverages/espresso-affogato.avif",
  "espresso con panna": "/assets/menu/generated/hot-beverages/espresso-con-panna.avif",
  "flat white": "/assets/menu/board-crops/hot-beverages/flat-white.avif",
  "french coffee": "/assets/menu/board-crops/hot-beverages/french-coffee.avif",
  "green tea": "/assets/menu/board-crops/hot-beverages/green-tea.avif",
  "hazelnut coffee": "/assets/menu/board-crops/hot-beverages/hazelnut-coffee.avif",
  "hazelnut coffee nutella": "/assets/menu/generated/hot-beverages/hazelnut-coffee-nutella.avif",
  "iced coffee": "/assets/menu/generated/cold-beverages/iced-coffee.avif",
  "hot chocolate": "/assets/menu/board-crops/hot-beverages/hot-chocolate.avif",
  "hot matcha": "/assets/menu/board-crops/hot-beverages/matcha-latte.avif",
  "hot spanish latte": "/assets/menu/board-crops/hot-beverages/hot-spanish-latte.avif",
  "hot white chocolate": "/assets/menu/board-crops/hot-beverages/hot-white-chocolate.avif",
  latte: "/assets/menu/board-crops/hot-beverages/latte.avif",
  macchiato: "/assets/menu/board-crops/hot-beverages/macchiato.avif",
  mocha: "/assets/menu/board-crops/hot-beverages/mocha.avif",
  "nutella coffee": "/assets/menu/generated/hot-beverages/nutella-coffee.avif",
  ristretto: "/assets/menu/generated/hot-beverages/ristretto.avif",
  tea: "/assets/menu/board-crops/hot-beverages/tea.avif",
  "turkish coffee": "/assets/menu/board-crops/hot-beverages/turkish-coffee.avif",
};

const PRODUCT_ALIASES: Record<string, string> = {
  "affogato espresso": "espresso affogato",
  "caramel frappe": "frappe caramel",
  "espresso conpanna": "espresso con panna",
  "frappe caramel": "caramel frappe",
  "frappe lotus": "lotus frappe",
  "frappe oreo": "oreo frappe",
  "frappe pistachio": "pistachio frappe",
};

const CATEGORY_IMAGES: Array<[RegExp, string]> = [
  [/hot|coffee|espresso|tea/i, "/assets/menu/categories-v2/hot-beverages.png"],
  [/iced|cold/i, "/assets/menu/categories-v2/iced-drinks.png"],
  [/shake/i, "/assets/menu/categories-v2/shakes.png"],
  [/smooth/i, "/assets/menu/categories-v2/smoothies.png"],
  [/juice/i, "/assets/menu/categories-v2/juices.png"],
  [/frapp/i, "/assets/menu/categories-v2/frappes.png"],
  [/cocktail|mojito/i, "/assets/menu/categories-v2/cocktails.png"],
  [/soft|soda|water|drink/i, "/assets/menu/categories-v2/soft-drinks.png"],
  [/matcha/i, "/assets/menu/categories-v2/matcha.png"],
  [/dessert|cake|bakery|pastry/i, "/assets/menu/categories-v2/desserts.png"],
  [/sandwich|food/i, "/assets/menu/categories-v2/sandwiches.png"],
  [/extra|modifier|boba/i, "/assets/menu/categories-v2/extras.png"],
];

// One cup, many drinks: changing this table recolors the liquid, highlights and garnish.
const COLD_DRINK_PALETTES: Array<[RegExp, { color: string; accent: string; icon: string }]> = [
  [/oreo|chocolate|mocha|nutella/i, { color: "#65412f", accent: "#c99572", icon: "Cocoa" }],
  [/coffee|latte|caramel|corto/i, { color: "#9b623c", accent: "#dfb786", icon: "Coffee" }],
  [/matcha|pistachio/i, { color: "#78934d", accent: "#c1d58a", icon: "Matcha" }],
  [/mango|passion/i, { color: "#f3a51f", accent: "#ffd45d", icon: "Mango" }],
  [/blueberry/i, { color: "#5554a7", accent: "#8d8bd2", icon: "Blueberry" }],
  [/berr|strawberry|raspberry/i, { color: "#a92e4f", accent: "#ef6b82", icon: "Berries" }],
  [/kiwi|green|avocado/i, { color: "#70a83f", accent: "#b9d85d", icon: "Kiwi" }],
  [/peach|apricot/i, { color: "#ef8054", accent: "#ffc07d", icon: "Peach" }],
  [/banana|pineapple/i, { color: "#e9c84b", accent: "#fff09b", icon: "Tropical" }],
  [/lemon|mint|mojito|sprite|seven/i, { color: "#9ac75b", accent: "#e3f29b", icon: "Citrus" }],
  [/cola|pepsi/i, { color: "#42251e", accent: "#a86845", icon: "Cola" }],
];

const HOT_DRINK_PALETTES: Array<[RegExp, { color: string; accent: string; icon: string }]> = [
  [/matcha|green tea/i, { color: "#718b45", accent: "#b7cf7b", icon: "Leaf" }],
  [/white chocolate/i, { color: "#e8d7bd", accent: "#fff4df", icon: "Chocolate" }],
  [/chocolate|mocha|nutella/i, { color: "#4f2d22", accent: "#a76a4d", icon: "Chocolate" }],
  [/tea|hibiscus/i, { color: "#a95b2d", accent: "#e3a85d", icon: "Leaf" }],
  [/caramel/i, { color: "#a96632", accent: "#dfaa69", icon: "Caramel" }],
  [/espresso|americano|black/i, { color: "#2d1710", accent: "#7d4b31", icon: "Beans" }],
];

function hotDrinkCupImage(name: string): string {
  const palette = HOT_DRINK_PALETTES.find(([pattern]) => pattern.test(name))?.[1] || {
    color: "#865034",
    accent: "#d5aa79",
    icon: "Beans",
  };
  const clipart = palette.icon === "Leaf"
    ? `<g fill="#668c3e"><path d="M0 25C-49 10-53-29-48-45-15-43 5-17 0 25Z"/><path d="M3 26C13-25 48-35 64-31 57 2 34 24 3 26Z"/></g>`
    : palette.icon === "Chocolate"
      ? `<g><rect x="-42" y="-34" width="52" height="52" rx="7" fill="#4c291f" transform="rotate(-12)"/><rect x="8" y="-20" width="49" height="49" rx="7" fill="#754733" transform="rotate(13)"/><path d="M-28-17h22V5h-22zM21-5h21v21H21z" fill="#aa7353"/></g>`
      : palette.icon === "Caramel"
        ? `<g fill="none" stroke="#c78445" stroke-width="12" stroke-linecap="round"><path d="M-48 12C-25-42 18 48 48-14"/><path d="M-43-15C-9 27 18-34 43 13"/></g>`
        : `<g><ellipse rx="19" ry="31" fill="#4b2417" transform="rotate(-28 -20 0)"/><path d="M-30-19q21 18 19 45" fill="none" stroke="#d29a6d" stroke-width="4"/><ellipse cx="28" cy="12" rx="17" ry="27" fill="#6a3824" transform="rotate(25 28 12)"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><metadata>joy-hot-cup</metadata><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#eee9e2"/><stop offset="1" stop-color="#bbb0a5"/></linearGradient><linearGradient id="paper" x2="1"><stop stop-color="#d9d5cf"/><stop offset=".3" stop-color="#fff"/><stop offset=".72" stop-color="#f8f5ef"/><stop offset="1" stop-color="#c9c3bb"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="24" flood-opacity=".3"/></filter></defs><rect width="900" height="900" fill="url(#bg)"/><ellipse cx="450" cy="786" rx="245" ry="46" fill="#231812" opacity=".2"/><g filter="url(#shadow)"><path d="M286 254h328l-43 458q-6 60-66 60H395q-60 0-66-60Z" fill="url(#paper)" stroke="#fff" stroke-width="7"/><ellipse cx="450" cy="254" rx="164" ry="42" fill="#f7f4ef" stroke="#fff" stroke-width="8"/><ellipse cx="450" cy="254" rx="145" ry="29" fill="${palette.color}"/><ellipse cx="450" cy="249" rx="120" ry="18" fill="${palette.accent}" opacity=".33"/><path d="M338 288l-14 367" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".65"/></g><g transform="translate(610 260)">${clipart}</g><g fill="none" stroke="#fff" stroke-linecap="round" opacity=".64"><path d="M380 185c-32-50 37-65 5-116" stroke-width="12"/><path d="M455 182c-29-42 33-58 4-104" stroke-width="10"/><path d="M525 188c-24-38 27-53 3-91" stroke-width="9"/></g><path d="M360 310c46 24 134 26 180 0" fill="none" stroke="${palette.accent}" stroke-width="5" opacity=".28"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function extraItemImage(name: string): string {
  const common = `fill="none" stroke="#f3dfbf" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"`;
  let color = "#b9783d";
  let label = "EXTRA";
  let artwork = `<g ${common}><path d="M330 575h240"/><path d="M360 565c10-130 170-130 180 0"/></g>`;
  if (/boba/i.test(name)) {
    color = "#5b3428"; label = "BOBA";
    artwork = `<g><path d="M320 265h260l-34 350q-5 48-53 48h-86q-48 0-53-48Z" fill="#e4b276" opacity=".9" stroke="#fff" stroke-width="10"/><g fill="#3b2019"><circle cx="390" cy="570" r="26"/><circle cx="450" cy="603" r="25"/><circle cx="510" cy="563" r="27"/><circle cx="420" cy="525" r="23"/><circle cx="486" cy="515" r="22"/></g><path d="M480 280l55-170" stroke="#24140f" stroke-width="26" stroke-linecap="round"/></g>`;
  } else if (/espresso/i.test(name)) {
    color = "#6e3c25"; label = "ESPRESSO SHOT";
    artwork = `<g ${common}><path d="M330 390h205v150q0 72-72 72h-61q-72 0-72-72Z" fill="#f7f2e8"/><path d="M535 425h38q65 0 65 59t-65 59h-38"/><ellipse cx="432" cy="391" rx="102" ry="27" fill="#52291c" stroke="#fff"/></g>`;
  } else if (/whipped cream/i.test(name)) {
    color = "#d2b892"; label = "WHIPPED CREAM";
    artwork = `<g fill="#fff8ec" stroke="#d8c3a6" stroke-width="8"><path d="M330 590c-22-52 14-92 60-94-35-48 7-91 55-82-20-53 62-72 77-17 48-5 67 48 35 81 55 11 66 78 19 112Z"/></g><circle cx="512" cy="388" r="14" fill="#b9783d"/>`;
  } else if (/pistachio|nuts/i.test(name)) {
    color = "#77904a"; label = /pistachio/i.test(name) ? "PISTACHIO" : "ROASTED NUTS";
    artwork = `<g><path d="M300 500q150 165 300 0Z" fill="#5b3424" stroke="#d7ae72" stroke-width="12"/><g fill="#b9c878" stroke="#665433" stroke-width="7"><ellipse cx="370" cy="475" rx="48" ry="30" transform="rotate(-18 370 475)"/><ellipse cx="455" cy="458" rx="50" ry="31" transform="rotate(11 455 458)"/><ellipse cx="535" cy="480" rx="47" ry="29" transform="rotate(-9 535 480)"/></g></g>`;
  } else if (/nutella/i.test(name)) {
    color = "#70402e"; label = "HAZELNUT";
    artwork = `<g><rect x="335" y="310" width="230" height="305" rx="42" fill="#f6eee2" stroke="#fff" stroke-width="10"/><rect x="360" y="270" width="180" height="58" rx="15" fill="#7b402e"/><path d="M365 470c60-58 110 55 170-8v115H365Z" fill="#75422f"/><circle cx="450" cy="421" r="58" fill="#4d291e"/><path d="M424 433q28-60 53 0" ${common}/></g>`;
  } else if (/white chocolate|kinder/i.test(name)) {
    color = "#d1ad79"; label = /kinder/i.test(name) ? "KINDER" : "WHITE CHOCOLATE";
    artwork = `<g transform="translate(450 475) rotate(-8)"><rect x="-150" y="-100" width="300" height="200" rx="22" fill="#fff3d9" stroke="#fff" stroke-width="10"/><path d="M-50-100v200M50-100v200M-150 0h300" stroke="#c89c67" stroke-width="8"/><path d="M-135 68c75-72 137 47 270-20v52h-270Z" fill="#9b5736" opacity=".85"/></g>`;
  } else if (/lotes|lotus/i.test(name)) {
    color = "#a86432"; label = "LOTUS BISCUIT";
    artwork = `<g transform="translate(450 475) rotate(-10)"><rect x="-145" y="-95" width="290" height="190" rx="26" fill="#b56d35" stroke="#e8b16d" stroke-width="11"/><rect x="-112" y="-65" width="224" height="130" rx="18" fill="none" stroke="#e8b16d" stroke-width="7"/><circle cx="0" cy="0" r="37" fill="none" stroke="#e8b16d" stroke-width="7"/></g>`;
  } else if (/puree/i.test(name)) {
    color = "#b94258"; label = "FRUIT PUREE";
    artwork = `<g><path d="M350 300h200l25 315H325Z" fill="#f3e9dc" stroke="#fff" stroke-width="10"/><path d="M337 470h226l12 145H325Z" fill="#b94258"/><circle cx="420" cy="435" r="45" fill="#dc5b70"/><circle cx="485" cy="421" r="52" fill="#f09a48"/><path d="M452 373c18-38 57-40 77-27-18 26-42 36-77 27Z" fill="#6f9945"/></g>`;
  } else if (/flavor/i.test(name)) {
    color = "#c37b35"; label = "FLAVOR SYRUP";
    artwork = `<g><rect x="350" y="300" width="200" height="330" rx="42" fill="#d38b3e" stroke="#fff" stroke-width="10"/><path d="M390 300v-70h120v70M410 230v-55h80" ${common}/><rect x="375" y="430" width="150" height="105" rx="16" fill="#f6e5c8"/><path d="M425 500c0-34 50-34 50 0" fill="none" stroke="#b36a2f" stroke-width="10"/></g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><defs><radialGradient id="bg"><stop stop-color="${color}" stop-opacity=".48"/><stop offset="1" stop-color="#17100c"/></radialGradient><filter id="s"><feDropShadow dy="20" stdDeviation="20" flood-opacity=".4"/></filter></defs><rect width="900" height="900" fill="url(#bg)"/><circle cx="450" cy="440" r="315" fill="#fff" opacity=".035"/><g filter="url(#s)">${artwork}</g><text x="450" y="755" text-anchor="middle" fill="#f7e8cf" font-family="Arial,sans-serif" font-size="27" font-weight="700" letter-spacing="6">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function coldDrinkCupImage(name: string): string {
  const palette = COLD_DRINK_PALETTES.find(([pattern]) => pattern.test(name))?.[1] || {
    color: "#c65f45",
    accent: "#f1a667",
    icon: "Mixed fruit",
  };
  const clipart: Record<string, string> = {
    Coffee: `<g><ellipse rx="19" ry="31" fill="#4b2417" transform="rotate(-28 -20 0)"/><path d="M-30-19q21 18 19 45" fill="none" stroke="#d29a6d" stroke-width="4"/><ellipse cx="28" cy="12" rx="17" ry="27" fill="#6a3824" transform="rotate(25 28 12)"/></g>`,
    Cocoa: `<g><rect x="-45" y="-30" width="48" height="48" rx="7" fill="#50291d" transform="rotate(-12)"/><rect x="7" y="-20" width="48" height="48" rx="7" fill="#75452f" transform="rotate(13)"/><path d="M-32-14h21v21h-21zM20-5h21v21H20z" fill="#a46d4c"/></g>`,
    Matcha: `<g fill="#668c3e"><path d="M0 25C-49 10-53-29-48-45-15-43 5-17 0 25Z"/><path d="M3 26C13-25 48-35 64-31 57 2 34 24 3 26Z"/></g>`,
    Mango: `<g><path d="M-42 15C-53-29-12-56 29-39 63-24 50 27 11 42-16 52-36 38-42 15Z" fill="#f7b329"/><path d="M9-41c14-23 37-20 51-12-12 17-28 25-51 12Z" fill="#5f913f"/></g>`,
    Berries: `<g><circle cx="-27" cy="4" r="25" fill="#a3274b"/><circle cx="5" cy="-17" r="26" fill="#d24465"/><circle cx="32" cy="13" r="24" fill="#7f2349"/><path d="M-2-43c16-20 35-17 47-9-13 14-27 20-47 9Z" fill="#679844"/></g>`,
    Blueberry: `<g fill="#4d4b99"><circle cx="-28" cy="6" r="27"/><circle cx="9" cy="-14" r="28"/><circle cx="35" cy="16" r="23"/></g>`,
    Kiwi: `<g><circle r="47" fill="#86b84c"/><circle r="12" fill="#e7efd0"/><g fill="#2d271e"><circle cx="0" cy="-28" r="3"/><circle cx="24" cy="-14" r="3"/><circle cx="25" cy="15" r="3"/><circle cx="0" cy="29" r="3"/><circle cx="-24" cy="15" r="3"/><circle cx="-24" cy="-14" r="3"/></g></g>`,
    Citrus: `<g><circle r="47" fill="#dced80" stroke="#fff" stroke-width="6"/><circle r="12" fill="#fff8cb"/><path d="M0-40V40M-35-20l70 40M-35 20l70-40" stroke="#82a943" stroke-width="3"/></g>`,
    Cola: `<g fill="none" stroke="#f4d8b7" stroke-width="5"><circle cx="-25" cy="15" r="15"/><circle cx="10" cy="-16" r="20"/><circle cx="37" cy="21" r="11"/></g>`,
  };
  const garnish = `<g transform="translate(605 220)">${clipart[palette.icon] || `<circle cx="-25" cy="4" r="27" fill="${palette.accent}"/><circle cx="14" cy="-7" r="30" fill="${palette.color}"/><circle cx="38" cy="18" r="22" fill="${palette.accent}"/><path d="M2-40c18-25 42-22 55-14-15 17-34 24-55 14Z" fill="#78a94b"/>`}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><metadata>joy-cold-cup</metadata><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f2eee8"/><stop offset="1" stop-color="#c8bdb2"/></linearGradient><linearGradient id="drink" x2=".7" y2="1"><stop stop-color="${palette.accent}"/><stop offset=".52" stop-color="${palette.color}"/><stop offset="1" stop-color="#4b251c"/></linearGradient><linearGradient id="glass" x2="1"><stop stop-color="#fff" stop-opacity=".42"/><stop offset=".42" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".28"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="22" stdDeviation="22" flood-opacity=".32"/></filter><clipPath id="inside"><path d="M283 260h334l-43 437q-5 48-53 48H379q-48 0-53-48Z"/></clipPath></defs><rect width="900" height="900" fill="url(#bg)"/><ellipse cx="450" cy="785" rx="250" ry="48" fill="#201712" opacity=".2"/><g filter="url(#shadow)"><path d="M270 248h360l-45 464q-6 60-66 60H381q-60 0-66-60Z" fill="url(#drink)" stroke="#fff" stroke-opacity=".76" stroke-width="8"/><g clip-path="url(#inside)" fill="#fff" fill-opacity=".3" stroke="#fff" stroke-opacity=".4" stroke-width="4"><rect x="330" y="310" width="82" height="68" rx="13" transform="rotate(-12 330 310)"/><rect x="470" y="292" width="92" height="73" rx="14" transform="rotate(14 470 292)"/><rect x="410" y="382" width="78" height="72" rx="13" transform="rotate(27 410 382)"/><circle cx="350" cy="505" r="7"/><circle cx="540" cy="445" r="9"/><circle cx="390" cy="585" r="5"/></g><path d="M270 248h360l-45 464q-6 60-66 60H381q-60 0-66-60Z" fill="url(#glass)"/><path d="M347 277l-18 394" stroke="#fff" stroke-width="11" stroke-linecap="round" opacity=".35"/><path d="M514 228L557 58" stroke="#17120f" stroke-width="25" stroke-linecap="round"/><path d="M252 214h396l21 37c5 10-2 22-14 22H245c-12 0-19-12-14-22Z" fill="#f5f3ef" fill-opacity=".72" stroke="#fff" stroke-width="8"/><ellipse cx="450" cy="216" rx="191" ry="35" fill="#fff" fill-opacity=".3" stroke="#fff" stroke-width="8"/><ellipse cx="450" cy="221" rx="150" ry="21" fill="${palette.accent}" fill-opacity=".78"/></g>${garnish}<text x="450" y="682" text-anchor="middle" fill="#fff" font-size="20" font-family="Arial,sans-serif" font-weight="700" letter-spacing="5" opacity=".9">${palette.icon.toUpperCase()}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function normalizeMenuImageKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveMenuImage(input: {
  category: string;
  name: string;
  ownerImageUrl?: string | null;
}): ResolvedMenuImage {
  if (input.ownerImageUrl) {
    return { source: "owner", src: input.ownerImageUrl };
  }
  const normalized = normalizeMenuImageKey(input.name);
  if (/^extras?$|extra boba/i.test(input.category)) {
    return { source: "generated", src: extraItemImage(normalized) };
  }
  if (/matcha/i.test(input.category)) {
    return {
      source: "generated",
      src: /^hot\b/i.test(normalized)
        ? hotDrinkCupImage(normalized)
        : coldDrinkCupImage(normalized),
    };
  }
  if (/hot beverage|hot drink/i.test(input.category)) {
    return { source: "generated", src: hotDrinkCupImage(normalized) };
  }
  if (/iced|cold|shake|smooth|juice|frapp|cocktail|mojito|soft drink|soda/i.test(`${input.category} ${input.name}`)) {
    return { source: "generated", src: coldDrinkCupImage(normalized) };
  }
  const aliased = PRODUCT_ALIASES[normalized] || normalized;
  const productImage = PRODUCT_IMAGES[normalized] || PRODUCT_IMAGES[aliased];
  if (productImage) return { source: "generated", src: productImage };

  const categoryImage = CATEGORY_IMAGES.find(([pattern]) =>
    pattern.test(`${input.category} ${input.name}`),
  )?.[1];
  return {
    source: "placeholder",
    src: categoryImage || "/assets/brand/joy-corner-catalog-empty-v1.jpg",
  };
}
