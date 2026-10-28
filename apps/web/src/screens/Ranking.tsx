import { useEffect, useState, type ReactNode } from "react";
import { MAIN_TRACK_ID, type RankingRowBase, type RankingTab, type RankingView } from "@ec/shared";
import { fetchRanking } from "../net/session";
import { fmtRace } from "../race/RaceHud";
import { setState, useStore } from "../store";
import { ChallengeCard } from "./ChallengeCard";

type TabId = "mes" | "tiroteio" | "rally" | "voltas";

interface Column<R> {
  title: string;
  value: (r: R) => string | number;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} de ${y}` : ym;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "mes", label: "Funcionário do mês" },
  { id: "tiroteio", label: "Tiroteio" },
  { id: "rally", label: "Rally" },
  { id: "voltas", label: "Recordes de volta" },
];

function Board<R extends RankingRowBase>({ tab, cols, empty, action }: { tab: RankingTab<R>; cols: Column<R>[]; empty: string; action?: { title: string; render: (r: R) => ReactNode } }) {
  if (!tab.rows.length) return <p className="muted" style={{ margin: 0 }}>{empty}</p>;
  const meId = tab.me?.id;
  const outside = tab.me && !tab.rows.some((r) => r.id === meId) ? tab.me : null;
  const line = (r: R) => (
    <tr key={r.id} className={r.id === meId ? "me" : r.rank === 1 ? "lead" : undefined}>
      <td className="num">{r.rank}º</td>
      <td>
        <strong>{r.name}</strong>
        {r.id === meId && <span className="tag" style={{ marginLeft: 8 }}>VOCÊ</span>}
      </td>
      {cols.map((c) => (
        <td key={c.title} className="num">
          {c.value(r)}
        </td>
      ))}
      {action && <td className="num">{action.render(r)}</td>}
    </tr>
  );
  return (
    <table className="table rank-table">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Nome</th>
          {cols.map((c) => (
            <th key={c.title} className="num">
              {c.title}
            </th>
          ))}
          {action && <th className="num">{action.title}</th>}
        </tr>
      </thead>
      <tbody>
        {tab.rows.map(line)}
        {outside && (
          <>
            <tr className="gap">
              <td colSpan={cols.length + 2 + (action ? 1 : 0)}>...</td>
            </tr>
            {line(outside)}
          </>
        )}
      </tbody>
    </table>
  );
}

/** Aba e pista abertas por último: quem volta do replay cai no mesmo lugar. */
let lastTab: TabId = "mes";
let lastPista: string = MAIN_TRACK_ID;

/** Ranking da firma: abas do mês, tiroteio, rally e recordes de volta. */
export function Ranking() {
  const account = useStore((s) => s.account);
  const [tab, setTabNow] = useState<TabId>(lastTab);
  const setTab = (t: TabId) => {
    lastTab = t;
    setTabNow(t);
  };
  const [pista, setPistaNow] = useState(lastPista);
  const setPista = (p: string) => {
    lastPista = p;
    setPistaNow(p);
  };
  const [view, setView] = useState<RankingView | null>(null);
  const [fail, setFail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRanking()
      .then((v) => alive && setView(v))
      .catch((e: Error) => alive && setFail(e.message));
    return () => {
      alive = false;
    };
  }, [account]);

  const leader = view?.mes.rows[0];
  const pistaView = view?.pistas.find((p) => p.id === pista) ?? view?.pistas[0];

  return (
    <div className="screen">
      <div className="wrap stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="brand" style={{ marginBottom: 0 }}>
            <h1>
              Ranking da <span>firma</span>
            </h1>
          </div>
          <button className="btn" onClick={() => setState({ ranking: false })}>
            Voltar
          </button>
        </div>

        {!account && <p className="muted" style={{ margin: 0 }}>Visitantes jogam, mas só quem entra com a conta aparece no ranking.</p>}

        <div className="seg rank-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {fail && <div className="error">{fail}</div>}
        {!view && !fail && <p className="muted">Carregando o ranking...</p>}

        {view && <ChallengeCard challenge={view.desafio} />}

        {view && tab === "mes" && (
          <div className="grid-2 even">
            <div className="postit rank-leader">
              <p className="label" style={{ color: "#1d1b17" }}>
                Funcionário do mês
              </p>
              <div className="who">{leader ? leader.name : "Vaga em aberto"}</div>
              <div>{leader ? `${leader.points} pontos até agora` : "Ninguém pontuou este mês ainda."}</div>
            </div>
            <div className="card">
              <p className="label">Funcionário do mês passado</p>
              {view.mesPassado ? (
                <>
                  <div className="rank-past">{view.mesPassado.name}</div>
                  <div className="muted">
                    {monthName(view.mesPassado.month)}, {view.mesPassado.points} pontos
                  </div>
                </>
              ) : (
                <div className="muted">Ninguém ainda.</div>
              )}
            </div>
          </div>
        )}

        {view && (
          <div className="card">
            {tab === "mes" && <Board tab={view.mes} cols={[{ title: "Pontos", value: (r) => r.points }]} empty="Ninguém pontuou este mês. Partidas com pelo menos 2 logados contam." />}
            {tab === "tiroteio" && (
              <Board
                tab={view.tiroteio}
                cols={[
                  { title: "Vitórias", value: (r) => r.wins },
                  { title: "Partidas", value: (r) => r.matches },
                  { title: "Eliminações", value: (r) => r.kills },
                ]}
                empty="Nenhum tiroteio registrado ainda."
              />
            )}
            {tab === "rally" && (
              <Board
                tab={view.rally}
                cols={[
                  { title: "Vitórias", value: (r) => r.wins },
                  { title: "Pódios", value: (r) => r.podiums },
                  { title: "Corridas", value: (r) => r.matches },
                ]}
                empty="Nenhuma corrida registrada ainda."
              />
            )}
            {tab === "voltas" && pistaView && (
              <div className="seg" style={{ marginBottom: 12 }}>
                {view.pistas.map((p) => (
                  <button key={p.id} className={p.id === pistaView.id ? "on" : ""} onClick={() => setPista(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            {tab === "voltas" && pistaView && (
              <Board
                tab={pistaView.voltas}
                cols={[{ title: "Melhor volta", value: (r) => fmtRace(r.ms) }]}
                action={{
                  title: "Replay",
                  render: (r) => (
                    <button className="btn small" onClick={() => setState({ replay: { pista: pistaView.id, linha: r.rank } })}>
                      Assistir
                    </button>
                  ),
                }}
                empty="Nenhuma volta registrada ainda. Treine no Contra o relógio."
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
