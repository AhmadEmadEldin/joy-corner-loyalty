import React, { useMemo, useState } from "react";

type Country = {
  accent: string;
  fact: string;
  flag: string;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  region: string;
};

type Card = Country & { cardId: string };
type Player = { beans: number; name: string };

const COUNTRIES: Country[] = [
  { id: "brazil", name: "Brazil", flag: "🇧🇷", region: "South America", latitude: -10.33, longitude: -53.2, fact: "The world's largest coffee producer", accent: "#d3a535" },
  { id: "vietnam", name: "Vietnam", flag: "🇻🇳", region: "Southeast Asia", latitude: 14.06, longitude: 108.28, fact: "Famous for bold robusta coffee", accent: "#b44c37" },
  { id: "colombia", name: "Colombia", flag: "🇨🇴", region: "South America", latitude: 4.57, longitude: -74.3, fact: "Loved for smooth, balanced arabica", accent: "#d9b84f" },
  { id: "indonesia", name: "Indonesia", flag: "🇮🇩", region: "Southeast Asia", latitude: -2.5, longitude: 118, fact: "Known for earthy island-grown beans", accent: "#9f4936" },
  { id: "ethiopia", name: "Ethiopia", flag: "🇪🇹", region: "East Africa", latitude: 9.15, longitude: 40.49, fact: "Celebrated as coffee's birthplace", accent: "#54744b" },
  { id: "uganda", name: "Uganda", flag: "🇺🇬", region: "East Africa", latitude: 1.37, longitude: 32.29, fact: "A leading home of native robusta", accent: "#bd7138" },
  { id: "india", name: "India", flag: "🇮🇳", region: "South Asia", latitude: 20.59, longitude: 78.96, fact: "Home of distinctive monsooned coffee", accent: "#c58b3b" },
  { id: "honduras", name: "Honduras", flag: "🇭🇳", region: "Central America", latitude: 14.8, longitude: -86.24, fact: "A major producer of sweet arabica", accent: "#487a79" },
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = copy[i];
    const target = copy[j];
    if (current !== undefined && target !== undefined) {
      copy[i] = target;
      copy[j] = current;
    }
  }
  return copy;
}

function makeDeck(): Card[] {
  return shuffle(COUNTRIES.flatMap((country) => [
    { ...country, cardId: `${country.id}-a` },
    { ...country, cardId: `${country.id}-b` },
  ]));
}

export function CoffeeWorldGame() {
  const [names, setNames] = useState(["Player 1", "Player 2"]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [turn, setTurn] = useState(0);
  const [die, setDie] = useState<number | null>(null);
  const [targetCountryId, setTargetCountryId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState("Add the explorers, then begin the coffee journey.");
  const [locked, setLocked] = useState(false);

  const finished = matched.length === COUNTRIES.length && players.length > 0;
  const ranking = useMemo(
    () => players.map((player, index) => ({ ...player, index })).sort((a, b) => b.beans - a.beans),
    [players],
  );

  function start() {
    const cleanNames = names.map((name) => name.trim()).filter(Boolean).slice(0, 6);
    if (cleanNames.length < 2) return;
    setPlayers(cleanNames.map((name) => ({ name, beans: 0 })));
    setDeck(makeDeck());
    setOpen([]);
    setMatched([]);
    setTurn(0);
    setDie(null);
    setTargetCountryId(null);
    setAttempts(0);
    setMessage(`${cleanNames[0]}, roll the dice to begin.`);
  }

  function roll() {
    if (die || finished) return;
    const currentPlayer = players[turn];
    if (!currentPlayer) return;
    const value = Math.floor(Math.random() * 6) + 1;
    const available = COUNTRIES.filter((country) => !matched.includes(country.id));
    const target = available[Math.floor(Math.random() * available.length)];
    if (!target) return;
    const tries = 3;
    setDie(value);
    setTargetCountryId(target.id);
    setAttempts(tries);
    setMessage(`${currentPlayer.name} rolled ${target.flag} ${target.name}. Find both ${target.name} cards!`);
  }

  function nextTurn(nextPlayers = players) {
    if (!nextPlayers.length) return;
    const next = (turn + 1) % nextPlayers.length;
    const nextPlayer = nextPlayers[next];
    if (!nextPlayer) return;
    setTurn(next);
    setDie(null);
    setTargetCountryId(null);
    setAttempts(0);
    setMessage(`${nextPlayer.name}, roll the dice.`);
  }

  function flip(card: Card) {
    if (!die || !targetCountryId || locked || open.includes(card.cardId) || matched.includes(card.id) || finished) return;
    const currentPlayer = players[turn];
    if (!currentPlayer) return;
    const isTarget = card.id === targetCountryId;
    const nextOpen = [...open, card.cardId];
    setOpen(nextOpen);
    setLocked(true);
    window.setTimeout(() => {
      setLocked(false);
      if (isTarget && nextOpen.length === 2) {
        const nextMatched = [...matched, card.id];
        const nextPlayers = players.map((player, index) => index === turn ? { ...player, beans: player.beans + 1 } : player);
        setOpen([]);
        setMatched(nextMatched);
        setPlayers(nextPlayers);
        if (nextMatched.length === COUNTRIES.length) {
          setDie(null);
          setTargetCountryId(null);
          setAttempts(0);
          setMessage(`${currentPlayer.name} found the final country!`);
        } else {
          nextTurn(nextPlayers);
        }
      } else if (isTarget) {
        setMessage(`Great! One ${card.name} card found. Catch the second one.`);
      } else {
        setOpen(open);
        const remaining = attempts - 1;
        setAttempts(remaining);
        if (remaining <= 0) {
          setOpen([]);
          nextTurn();
        } else setMessage(`That is ${card.name}, not the target. ${currentPlayer.name} has ${remaining} ${remaining === 1 ? "guess" : "guesses"} left.`);
      }
    }, 650);
  }

  if (!players.length) {
    return (
      <section className="portal-section coffee-game coffee-game-setup">
        <div className="coffee-game-kicker">Joy Corner presents</div>
        <h2>Around the world in 16 cards</h2>
        <p className="coffee-game-lead">Match 8 famous coffee origins, collect beans, and discover who becomes the Coffee World Champion.</p>
        <div className="coffee-game-rule-strip">
          <span><b>16</b> cards</span><span><b>8</b> countries</span><span><b>3</b> guesses per roll</span><span><b>1</b> bean per catch</span>
        </div>
        <div className="coffee-player-setup">
          <h3>Who's playing?</h3>
          {names.map((name, index) => (
            <label key={index}><span>{index + 1}</span><input aria-label={`Player ${index + 1} name`} maxLength={20} onChange={(event) => setNames((current) => current.map((item, i) => i === index ? event.target.value : item))} value={name} />{names.length > 2 ? <button aria-label={`Remove player ${index + 1}`} onClick={() => setNames((current) => current.filter((_, i) => i !== index))} type="button">×</button> : null}</label>
          ))}
          <div className="coffee-setup-actions">
            <button className="button-secondary" disabled={names.length >= 6} onClick={() => setNames((current) => [...current, `Player ${current.length + 1}`])} type="button">+ Add player</button>
            <button disabled={names.filter((name) => name.trim()).length < 2} onClick={start} type="button">Start the journey</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="portal-section coffee-game">
      <header className="coffee-game-header">
        <div><p className="eyebrow">Joy Corner coffee journey</p><h2>Around the world</h2><p>{message}</p></div>
        <button className="button-secondary" onClick={() => setPlayers([])} type="button">New game</button>
      </header>
      <div className="coffee-scoreboard" aria-label="Player scores">
        {players.map((player, index) => <div className={index === turn && !finished ? "current" : ""} key={`${player.name}-${index}`}><span>{index === turn && !finished ? "Current explorer" : `Explorer ${index + 1}`}</span><strong>{player.name}</strong><b>{"☕".repeat(player.beans) || "—"} <small>{player.beans} beans</small></b></div>)}
      </div>
      {finished ? (
        <div className="coffee-winners"><span className="coffee-trophy">🏆</span><p className="eyebrow">Final ranking</p><h3>{ranking[0]?.name} is the Coffee World Champion!</h3><ol>{ranking.map((player, index) => <li key={`${player.name}-${player.index}`}><span>{index + 1}</span><strong>{player.name}</strong><b>{player.beans} beans</b></li>)}</ol><button onClick={start} type="button">Play again</button></div>
      ) : (
        <div className="coffee-game-layout">
          <aside className="coffee-route"><div className="coffee-route-title"><span>WORLD COFFEE ROUTE</span><small>{COUNTRIES.length - matched.length} origins remaining</small></div><div className="coffee-route-map">{COUNTRIES.map((country) => <div className={`${matched.includes(country.id) ? "collected" : ""} ${targetCountryId === country.id ? "target" : ""}`} key={country.id} style={{ "--pin-x": `${((country.longitude + 180) / 360) * 100}%`, "--pin-y": `${((90 - country.latitude) / 180) * 100}%`, "--pin-color": country.accent } as React.CSSProperties}><i>{matched.includes(country.id) ? "✓" : country.flag}</i><span>{country.name}</span></div>)}</div><div className="coffee-dice"><span className={die ? "rolled" : ""}>{targetCountryId ? COUNTRIES.find((country) => country.id === targetCountryId)?.flag : "?"}</span><button disabled={Boolean(die)} onClick={roll} type="button">{targetCountryId ? `Catch ${COUNTRIES.find((country) => country.id === targetCountryId)?.name} · ${attempts} guesses` : "Roll the country dice"}</button><small>The dice chooses one coffee country. Find both matching cards.</small></div></aside>
          <div className="coffee-memory-board" aria-label="16-card coffee country memory board">{deck.map((card) => { const revealed = open.includes(card.cardId) || matched.includes(card.id); return <button aria-label={revealed ? card.name : "Hidden coffee country"} className={`${revealed ? "revealed" : ""} ${matched.includes(card.id) ? "matched" : ""}`} disabled={!die || matched.includes(card.id)} key={card.cardId} onClick={() => flip(card)} style={{ "--country-accent": card.accent } as React.CSSProperties} type="button"><span className="card-back"><i>JC</i><b>COFFEE<br />WORLD</b><small>Flip to explore</small></span><span className="card-face"><i>{card.flag}</i><b>{card.name}</b><small>{card.region}</small><em>{card.fact}</em></span></button>; })}</div>
        </div>
      )}
    </section>
  );
}
