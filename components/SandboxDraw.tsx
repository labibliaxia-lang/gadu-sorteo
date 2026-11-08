"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Dices,
  EyeOff,
  FlaskConical,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  Minus,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Unlock,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  LiveDrawAnimation,
  type LiveWinner,
} from "@/components/LiveDrawAnimation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MultiPrizeVerifier } from "@/components/MultiPrizeVerifier";
import { Input } from "@/components/ui/input";
import { WinnerCertificate } from "@/components/WinnerCertificate";
import {
  computeMultiPrizeVerification,
  DRAW_DOMAIN,
  sha256Hex,
  type MultiPrizeWinner,
} from "@/lib/draw-verify";
import { cn } from "@/lib/utils";

interface SandboxCommitment {
  run_id: string;
  commitment: string;
  numbers: string;
  numbers_count: number;
  prizes_count: number;
  created_at: string;
}

interface SandboxWinner {
  position: number;
  number: number;
  hash: string;
}

interface SandboxResult {
  winning_number: number;
  seed: string;
  commitment: string;
  numbers_hash: string;
  result_hash: string;
  numbers_count: number;
  numbers: string;
  prizes_count: number;
  winners: SandboxWinner[];
  results_hash: string;
}

const MAX_NUMBERS = 10000;
const MAX_PRIZES = 50;
const VISIBLE_NUMBERS = 500;

/** Atajos para armar el escenario con un toque en el celular. */
const NUMBER_PRESETS = [100, 500, 1000, 5000, 10000];
const PRIZE_PRESETS = [1, 2, 3, 5, 10];

/* ============================================================
   Mesa de pruebas pública (100% navegador)
   ============================================================ */

const MAX_LOCAL_NUMBERS = 500;
const MAX_LOCAL_PRIZES = 10;
const DEFAULT_LOCAL_NUMBERS = 100;
const DEFAULT_LOCAL_PRIZES = 3;
const LOCAL_NUMBER_PRESETS = [20, 50, 100, 250, 500];
const LOCAL_PRIZE_PRESETS = [1, 2, 3, 5, 10];

interface LocalCommitment {
  runId: string;
  seed: string;
  hash: string;
  numbers: number[];
  prizes: number;
  prizeNames: string[];
}

interface LocalResult {
  commitment: string;
  numbersHash: string;
  winners: MultiPrizeWinner[];
  resultsHash: string;
  list: string;
}

/**
 * Escenario que comparten la ceremonia y la mesa de pruebas.
 * Es la única fuente de verdad del límite de números y de los nombres.
 */
interface LocalScenario {
  numberCount: number;
  prizeCount: number;
  prizeNames: string[];
  sold: Set<number>;
}

interface LocalResultSnapshot {
  winners: MultiPrizeWinner[];
  prizeNames: string[];
}

type ScenarioUpdater = (updater: (previous: LocalScenario) => LocalScenario) => void;

function initialLocalScenario(): LocalScenario {
  return {
    numberCount: DEFAULT_LOCAL_NUMBERS,
    prizeCount: DEFAULT_LOCAL_PRIZES,
    prizeNames: Array.from({ length: DEFAULT_LOCAL_PRIZES }, () => ""),
    sold: allNumbers(DEFAULT_LOCAL_NUMBERS),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function allNumbers(count: number): Set<number> {
  return new Set(Array.from({ length: count }, (_, index) => index + 1));
}

function pad4(value: number | null): string {
  return value == null ? "----" : String(value).padStart(4, "0");
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);

  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function localPrizeLabel(position: number, names: string[]): string {
  const custom = names[position - 1]?.trim();
  if (custom) return custom;
  return position === 1 ? "1.er premio" : `${position}º premio`;
}

/** Copia un hash o una semilla sin salir de la mesa de pruebas. */
function CopyChip({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // El portapapeles puede estar bloqueado; la demo sigue funcionando.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hairline px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle transition-colors hover:border-hairline-strong hover:text-fg"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      {copied ? "Copiado" : label}
    </button>
  );
}

function PresetChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors disabled:opacity-40",
        active
          ? "border-brand-500/50 bg-brand-500/10 text-fg"
          : "border-hairline text-fg-subtle hover:border-hairline-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function ActionChip({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-md border border-hairline bg-panel-1/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-subtle transition-colors hover:border-hairline-strong hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const DEMO_TABS = [
  {
    id: "animacion",
    label: "Mirá la animación",
    hint: "Vista previa",
    icon: Play,
  },
  {
    id: "simulador",
    label: "Probalo vos mismo",
    hint: "Interactivo",
    icon: FlaskConical,
  },
] as const;

type DemoTabId = (typeof DEMO_TABS)[number]["id"];

/**
 * Pestañas de la sección demo. Envuelve la animación cinematográfica y la mesa
 * de pruebas sin desmontarlas: cada pestaña conserva su estado al cambiar.
 */
export function DrawDemoTabs({
  animation,
  sandbox,
}: {
  animation: ReactNode;
  sandbox: ReactNode;
}) {
  const [active, setActive] = useState<DemoTabId>("animacion");

  function focusTab(id: DemoTabId) {
    setActive(id);
    document.getElementById(`demo-tab-${id}`)?.focus();
  }

  function move(direction: -1 | 1) {
    const index = DEMO_TABS.findIndex((tab) => tab.id === active);
    const next = DEMO_TABS[(index + direction + DEMO_TABS.length) % DEMO_TABS.length];
    focusTab(next.id);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Cómo probar el sorteo"
        className="grid gap-1 rounded-xl border border-hairline bg-panel-2/70 p-1 sm:grid-cols-2"
      >
        {DEMO_TABS.map((tab) => {
          const selected = tab.id === active;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`demo-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`demo-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  move(1);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusTab(DEMO_TABS[0].id);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusTab(DEMO_TABS[DEMO_TABS.length - 1].id);
                }
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-panel-1 text-fg shadow-soft ring-1 ring-hairline"
                  : "text-fg-subtle hover:bg-panel-3/60 hover:text-fg",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  selected ? "text-brand-accent" : "text-fg-faint",
                )}
                aria-hidden="true"
              />
              {tab.label}
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]",
                  selected
                    ? "border-brand-500/30 text-brand-accent"
                    : "border-hairline text-fg-faint",
                )}
              >
                {tab.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="demo-panel-animacion"
        aria-labelledby="demo-tab-animacion"
        hidden={active !== "animacion"}
        className="mt-4"
      >
        {animation}
      </div>
      <div
        role="tabpanel"
        id="demo-panel-simulador"
        aria-labelledby="demo-tab-simulador"
        hidden={active !== "simulador"}
        className="mt-4"
      >
        {sandbox}
      </div>
    </div>
  );
}

/**
 * Experiencia completa de la demo: el escenario vive acá para que las dos
 * pestañas hablen del mismo límite de números, de los mismos premios y de los
 * mismos nombres. La ceremonia recibe ese escenario por props; la mesa de
 * pruebas lo edita. Si el usuario corre una simulación, la animación reutiliza
 * esos ganadores exactos.
 */
export function DemoExperience() {
  const [scenario, setScenario] = useState<LocalScenario>(
    initialLocalScenario,
  );
  const [resultado, setResultado] = useState<LocalResultSnapshot | null>(null);
  // Remonta la ceremonia cuando cambia el escenario para que no quede un
  // podio viejo con nombres o números de la configuración anterior.
  const [revision, setRevision] = useState(0);

  const updateScenario: ScenarioUpdater = (updater) => {
    // Cualquier cambio invalida la corrida anterior: la ceremonia no debe
    // mostrar premios de un escenario que ya no existe.
    setResultado(null);
    setRevision((value) => value + 1);
    setScenario(updater);
  };

  function aplicarResultado(result: LocalResultSnapshot) {
    setResultado(result);
    setRevision((value) => value + 1);
  }

  const soldNumbers = useMemo(
    () => [...scenario.sold].sort((a, b) => a - b),
    [scenario.sold],
  );

  const demoWinners = useMemo<LiveWinner[]>(() => {
    if (!resultado) return [];
    return resultado.winners.map((winner) => ({
      position: winner.position,
      number: winner.number,
      name: "Participante simulado",
      prizeTitle: localPrizeLabel(winner.position, resultado.prizeNames),
    }));
  }, [resultado]);

  const listoParaAnimar =
    soldNumbers.length > 0 && soldNumbers.length >= scenario.prizeCount;

  return (
    <DrawDemoTabs
      animation={
        <div className="rounded-xl border border-hairline bg-panel-2 p-4 sm:p-6">
          {listoParaAnimar ? (
            <>
              <p className="mb-4 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
                Ceremonia con {soldNumbers.length.toLocaleString("es-AR")}{" "}
                número{soldNumbers.length === 1 ? "" : "s"} y{" "}
                {scenario.prizeCount} premio
                {scenario.prizeCount === 1 ? "" : "s"} de tu escenario
              </p>
              <LiveDrawAnimation
                key={`demo-${revision}`}
                raffleId="demo-como-funciona"
                initialStatus="active"
                initialWinner={null}
                soldCount={soldNumbers.length}
                canDraw={false}
                hasCommitment
                sampleNumbers={soldNumbers}
                isDemo
                simulatedWinners={demoWinners}
                demoPrizeNames={scenario.prizeNames}
              />
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-hairline-strong bg-panel-1/60 p-6 text-center">
              <FlaskConical
                className="mx-auto h-6 w-6 text-brand-accent"
                aria-hidden="true"
              />
              <p className="mt-3 text-[13px] font-semibold text-fg">
                Primero armá el escenario
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-fg-subtle">
                En «Probalo vos mismo» elegí al menos {scenario.prizeCount}{" "}
                número{scenario.prizeCount === 1 ? "" : "s"} vendido
                {scenario.prizeCount === 1 ? "" : "s"} para ver la ceremonia
                con tus premios.
              </p>
            </div>
          )}
        </div>
      }
      sandbox={
        <div className="rounded-xl border border-hairline bg-panel-2 p-4 sm:p-6">
          <SandboxDrawLocal
            scenario={scenario}
            updateScenario={updateScenario}
            onResult={aplicarResultado}
          />
        </div>
      }
    />
  );
}

/**
 * Simulador educativo, 100% estado de React.
 *
 * No consulta Supabase ni ejecuta RPCs: genera la semilla con `crypto`, publica
 * el compromiso, deriva los ganadores con la misma fórmula que el motor real y
 * deja que el verificador del navegador recalcule todo.
 *
 * El escenario vive en el contenedor (`DemoExperience`) para que la ceremonia
 * de la otra pestaña use exactamente el mismo límite y los mismos nombres.
 */
function SandboxDrawLocal({
  scenario,
  updateScenario,
  onResult,
}: {
  scenario: LocalScenario;
  updateScenario: ScenarioUpdater;
  onResult?: (result: LocalResultSnapshot) => void;
}) {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { numberCount, prizeCount, prizeNames, sold } = scenario;

  const [phase, setPhase] = useState<
    "idle" | "committed" | "revealing" | "revealed"
  >("idle");
  const [commitment, setCommitment] = useState<LocalCommitment | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const soldNumbers = useMemo(
    () => [...sold].sort((a, b) => a - b),
    [sold],
  );

  // La grilla se lee mejor en bloques de 10: una fila (o dos en celular) por
  // decena, con fondo alternado para no perder el número.
  const decadas = useMemo(() => {
    const bloques: number[][] = [];
    for (let start = 1; start <= numberCount; start += 10) {
      const end = Math.min(start + 9, numberCount);
      bloques.push(
        Array.from({ length: end - start + 1 }, (_, index) => start + index),
      );
    }
    return bloques;
  }, [numberCount]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const frozen = phase !== "idle";
  const canDraw =
    !frozen && !busy && soldNumbers.length > 0 && soldNumbers.length >= prizeCount;

  const winnersByNumber = useMemo(() => {
    const map = new Map<number, MultiPrizeWinner>();
    result?.winners.forEach((winner) => map.set(winner.number, winner));
    return map;
  }, [result]);

  const commitmentOk =
    result != null && commitment != null && result.commitment === commitment.hash;

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function applyNumberCount(raw: number) {
    if (frozen) return;

    const next = clamp(Math.floor(raw) || 1, 1, MAX_LOCAL_NUMBERS);

    updateScenario((previous) => {
      const nextPrizes = Math.min(
        previous.prizeCount,
        MAX_LOCAL_PRIZES,
        next,
      );

      return {
        ...previous,
        numberCount: next,
        prizeCount: nextPrizes,
        prizeNames: Array.from(
          { length: nextPrizes },
          (_, index) => previous.prizeNames[index] ?? "",
        ),
        // El sorteo solo puede elegir dentro de 1..next.
        sold: allNumbers(next),
      };
    });
  }

  function applyPrizeCount(raw: number) {
    if (frozen) return;

    updateScenario((previous) => {
      const max = Math.min(MAX_LOCAL_PRIZES, previous.numberCount);
      const next = clamp(Math.floor(raw) || 1, 1, max);

      return {
        ...previous,
        prizeCount: next,
        prizeNames: Array.from(
          { length: next },
          (_, index) => previous.prizeNames[index] ?? "",
        ),
      };
    });
  }

  function toggleNumber(number: number) {
    if (frozen) return;

    updateScenario((previous) => {
      const sold = new Set(previous.sold);
      if (sold.has(number)) sold.delete(number);
      else sold.add(number);
      return { ...previous, sold };
    });
  }

  function sellAll() {
    if (frozen) return;
    updateScenario((previous) => ({
      ...previous,
      sold: allNumbers(previous.numberCount),
    }));
  }

  function sellNone() {
    if (frozen) return;
    updateScenario((previous) => ({ ...previous, sold: new Set() }));
  }

  function sellRandom() {
    if (frozen) return;

    updateScenario((previous) => {
      const pool = Array.from(
        { length: previous.numberCount },
        (_, index) => index + 1,
      );
      for (let index = pool.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [pool[index], pool[swap]] = [pool[swap], pool[index]];
      }

      const target = clamp(
        Math.round(previous.numberCount * 0.6),
        Math.min(previous.prizeCount, previous.numberCount),
        previous.numberCount,
      );

      return { ...previous, sold: new Set(pool.slice(0, target)) };
    });
  }

  function updatePrizeName(index: number, value: string) {
    updateScenario((previous) => {
      const prizeNames = Array.from(
        { length: previous.prizeCount },
        (_, position) => previous.prizeNames[position] ?? "",
      );
      prizeNames[index] = value.slice(0, 40);
      return { ...previous, prizeNames };
    });
  }

  function animate(target: number | null, pool: number[], done: () => void) {
    clearTimers();

    if (pool.length === 0) {
      setDisplay(target);
      timers.current.push(setTimeout(done, 500));
      return;
    }

    let tick = 0;
    const total = 26;

    const step = () => {
      tick += 1;

      if (tick < total) {
        setDisplay(pool[Math.floor(Math.random() * pool.length)] ?? null);
        const delay = 38 + Math.pow(tick / total, 3) * 95;
        timers.current.push(setTimeout(step, delay));
        return;
      }

      setDisplay(target);
      timers.current.push(setTimeout(done, 650));
    };

    step();
  }

  async function sortear() {
    if (!canDraw) return;

    setBusy(true);
    setError(null);
    clearTimers();
    setDisplay(null);

    try {
      const runId = `sim-${randomHex(4)}`;
      const seed = randomHex(32);
      const hash = await sha256Hex(
        `${DRAW_DOMAIN}|raffle:${runId}|seed:${seed}`,
      );

      setCommitment({
        runId,
        seed,
        hash,
        numbers: soldNumbers,
        prizes: prizeCount,
        prizeNames: Array.from(
          { length: prizeCount },
          (_, index) => prizeNames[index] ?? "",
        ),
      });
      setResult(null);
      setPhase("committed");
    } catch {
      setError(
        "No se pudo calcular el hash en este navegador. Probá desde https o localhost.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revelar() {
    if (!commitment || phase !== "committed") return;

    setBusy(true);
    setError(null);
    setPhase("revealing");

    try {
      const computed = await computeMultiPrizeVerification({
        raffleId: commitment.runId,
        seed: commitment.seed,
        numbers: commitment.numbers,
        prizesCount: commitment.prizes,
      });

      setResult({
        commitment: computed.commitment,
        numbersHash: computed.numbersHash,
        winners: computed.winners,
        resultsHash: computed.resultsHash,
        list: computed.list,
      });

      // La ceremonia de la otra pestaña reutiliza estos ganadores exactos,
      // siempre dentro del listado vendido y con los nombres comprometidos.
      onResult?.({
        winners: computed.winners,
        prizeNames: commitment.prizeNames,
      });

      animate(computed.winners[0]?.number ?? null, commitment.numbers, () => {
        setPhase("revealed");
        setBusy(false);
      });
    } catch {
      setError(
        "No se pudo revelar el resultado. Revisá que el navegador permita SHA-256.",
      );
      setPhase("committed");
      setBusy(false);
    }
  }

  function reset() {
    clearTimers();
    setPhase("idle");
    setCommitment(null);
    setResult(null);
    setDisplay(null);
    setError(null);
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel-3 text-brand-accent ring-1 ring-hairline">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand-accent">
            Mesa de pruebas
          </p>
          <p className="text-[13px] font-semibold text-fg">
            Armá el escenario y verificá el resultado
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">
          <Sparkles className="h-3 w-3" />
          100% navegador
        </Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <div>
            <p className="eyebrow">Escenario</p>
            <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
              Elegí cuántos números hay, cuántos premios se juegan y cuáles están
              vendidos. El sorteo solo puede elegir entre los vendidos.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="sandbox-number-count"
              className="text-[11px] font-medium text-fg-muted"
            >
              Números disponibles
            </label>
            <Input
              id="sandbox-number-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_LOCAL_NUMBERS}
              value={numberCount}
              disabled={frozen}
              onChange={(event) => applyNumberCount(Number(event.target.value))}
              className="text-center font-mono"
            />
            <div className="flex flex-wrap gap-1.5">
              {LOCAL_NUMBER_PRESETS.map((preset) => (
                <PresetChip
                  key={preset}
                  active={numberCount === preset}
                  disabled={frozen}
                  onClick={() => applyNumberCount(preset)}
                >
                  {preset.toLocaleString("es-AR")}
                </PresetChip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="sandbox-prize-count"
              className="text-[11px] font-medium text-fg-muted"
            >
              Premios
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Un premio menos"
                disabled={frozen || prizeCount <= 1}
                onClick={() => applyPrizeCount(prizeCount - 1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="sandbox-prize-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.min(MAX_LOCAL_PRIZES, numberCount)}
                value={prizeCount}
                disabled={frozen}
                onChange={(event) => applyPrizeCount(Number(event.target.value))}
                className="text-center font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Un premio más"
                disabled={
                  frozen || prizeCount >= Math.min(MAX_LOCAL_PRIZES, numberCount)
                }
                onClick={() => applyPrizeCount(prizeCount + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LOCAL_PRIZE_PRESETS.filter(
                (preset) => preset <= Math.min(MAX_LOCAL_PRIZES, numberCount),
              ).map((preset) => (
                <PresetChip
                  key={preset}
                  active={prizeCount === preset}
                  disabled={frozen}
                  onClick={() => applyPrizeCount(preset)}
                >
                  {preset}
                </PresetChip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-fg-muted">
              Nombres de los premios{" "}
              <span className="font-normal text-fg-faint">(opcional)</span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: prizeCount }, (_, index) => (
                <label key={index} className="flex min-w-0 items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-fg-faint">
                    {index + 1}º
                  </span>
                  <input
                    value={prizeNames[index] ?? ""}
                    onChange={(event) =>
                      updatePrizeName(index, event.target.value)
                    }
                    placeholder={`Premio ${index + 1}`}
                    maxLength={40}
                    disabled={frozen}
                    className="h-8 w-full min-w-0 rounded-md border border-hairline bg-panel-1 px-2 text-[11px] text-fg placeholder:text-fg-faint focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-fg-muted">
              Números vendidos
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
              <span className="text-brand-accent">
                {sold.size.toLocaleString("es-AR")}
              </span>{" "}
              / {numberCount.toLocaleString("es-AR")} en juego
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionChip disabled={frozen} onClick={sellAll}>
              Todos
            </ActionChip>
            <ActionChip disabled={frozen} onClick={sellNone}>
              Ninguno
            </ActionChip>
            <ActionChip disabled={frozen} onClick={sellRandom}>
              <Dices className="h-3 w-3" aria-hidden="true" />
              Al azar 60%
            </ActionChip>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-hairline bg-panel-1/40 p-2">
            <div className="space-y-1.5">
              {decadas.map((decena, index) => (
                <div
                  key={decena[0]}
                  role="group"
                  aria-label={`Números ${decena[0]} a ${decena[decena.length - 1]}`}
                  className={cn(
                    "grid grid-cols-5 gap-1 rounded-md px-1 py-1 sm:grid-cols-10",
                    index % 2 === 1 && "bg-panel-2/60",
                  )}
                >
                  {decena.map((number) => {
                    const isSold = sold.has(number);
                    const winner = winnersByNumber.get(number);

                    return (
                      <button
                        key={number}
                        type="button"
                        onClick={() => toggleNumber(number)}
                        disabled={frozen}
                        aria-pressed={isSold}
                        aria-label={`Número ${number}${
                          isSold ? ", vendido" : ", fuera del sorteo"
                        }`}
                        title={
                          winner && commitment
                            ? localPrizeLabel(
                                winner.position,
                                commitment.prizeNames,
                              )
                            : undefined
                        }
                        className={cn(
                          "flex h-8 items-center justify-center rounded-md border font-mono text-[10px] tabular-nums transition-colors",
                          winner
                            ? "border-brand-500 bg-brand-500 font-bold text-ink shadow-glow"
                            : isSold
                              ? "border-hairline-strong bg-panel-3 text-fg hover:border-brand-500/50"
                              : "border-hairline bg-panel-1/30 text-fg-faint hover:border-hairline-strong hover:text-fg-subtle",
                          frozen && "cursor-default",
                        )}
                      >
                        {number}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-fg-subtle">
            Tocá la grilla para sumar o sacar números. Para armar tu propio
            cartón, tocá «Ninguno» y elegí los tuyos. El sistema solo puede
            elegir entre los que quedan vendidos.
          </p>

          {sold.size < prizeCount && (
            <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              Necesitás al menos {prizeCount} números vendidos para sortear{" "}
              {prizeCount} premio{prizeCount === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-panel-1 p-6 text-center sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 blueprint-grid opacity-[0.12]"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand-accent">
              Mesa de pruebas
            </p>
            <span
              className="h-1 w-1 rounded-full bg-hairline-strong"
              aria-hidden="true"
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
              {phase === "idle" && "Lista para sortear"}
              {phase === "committed" && "Compromiso publicado"}
              {phase === "revealing" && "Revelando ganador"}
              {phase === "revealed" && "Resultado revelado"}
            </p>
          </div>

          <p
            className={cn(
              "mt-4 font-mono text-6xl font-medium tabular-nums tracking-[0.08em] sm:text-7xl",
              phase === "revealed" ? "text-brand-accent" : "text-fg",
            )}
            aria-live={phase === "revealing" ? "off" : "polite"}
          >
            {pad4(display)}
          </p>

          <p className="mt-3 text-[12px] leading-relaxed text-fg-subtle">
            {phase === "idle" &&
              `${sold.size.toLocaleString("es-AR")} números vendidos · ${prizeCount} premio${
                prizeCount === 1 ? "" : "s"
              } · el hash se calcula en tu navegador`}
            {phase === "committed" &&
              "El compromiso ya está fijado. La semilla sigue oculta: nadie puede cambiar el resultado sin que el hash deje de coincidir."}
            {phase === "revealing" &&
              "Recalculando el resultado con la semilla comprometida…"}
            {phase === "revealed" &&
              "El resultado se deriva del compromiso. Verificá abajo que todo coincide."}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {phase === "idle" && (
              <Button size="lg" onClick={() => void sortear()} disabled={!canDraw}>
                {busy ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Lock className="mr-2 h-5 w-5" />
                )}
                {busy ? "Calculando hash…" : "Sortear"}
              </Button>
            )}

            {phase === "committed" && (
              <>
                <Button size="lg" onClick={() => void revelar()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Unlock className="mr-2 h-5 w-5" />
                  )}
                  {busy ? "Revelando…" : "Revelar ganador"}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={reset}
                  disabled={busy}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reiniciar
                </Button>
              </>
            )}

            {phase === "revealing" && (
              <Button size="lg" disabled>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Revelando…
              </Button>
            )}

            {phase === "revealed" && (
              <Button variant="secondary" size="lg" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Otra simulación
              </Button>
            )}
          </div>

          {phase === "idle" && !canDraw && (
            <p className="mt-3 text-[11px] text-brand-accent">
              {sold.size < prizeCount
                ? `Elegí al menos ${prizeCount} números vendidos para sortear.`
                : "Calculando…"}
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      {commitment && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/[0.04] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound
              className="h-4 w-4 text-brand-accent"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold">
              Paso 1 · Compromiso publicado
            </p>
            <Badge variant="success" className="ml-auto">
              <ShieldCheck className="h-3 w-3" />
              SHA-256
            </Badge>
          </div>

          <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
            Este hash quedó fijado{" "}
            <strong className="text-fg">antes</strong> de revelar el ganador. Si
            alguien cambiara la semilla o el listado, el hash no coincidiría.
          </p>

          <div className="mt-3 rounded-lg border border-hairline bg-panel-1/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
                Compromiso
              </p>
              <CopyChip value={commitment.hash} />
            </div>
            <code className="mt-2 block break-all font-mono text-[11px] leading-relaxed text-fg-muted">
              {commitment.hash}
            </code>
          </div>

          <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-3">
            <p className="text-fg-subtle">
              Simulación{" "}
              <span className="font-mono text-fg-muted">
                {commitment.runId}
              </span>
            </p>
            <p className="text-fg-subtle">
              Números{" "}
              <span className="font-mono text-fg-muted">
                {commitment.numbers.length.toLocaleString("es-AR")}
              </span>
            </p>
            <p className="text-fg-subtle">
              Premios{" "}
              <span className="font-mono text-fg-muted">
                {commitment.prizes}
              </span>
            </p>
          </div>

          {phase === "committed" && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              Semilla oculta. Se revela junto con el resultado.
            </p>
          )}
        </div>
      )}

      {phase === "revealed" && result && commitment && (
        <div className="space-y-4">
          <div className="rounded-xl border border-hairline bg-panel-2/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Trophy
                className="h-4 w-4 text-brand-accent"
                aria-hidden="true"
              />
              <h3 className="font-display text-lg font-semibold">
                Resultado de la simulación
              </h3>
              <Badge variant="success" className="ml-auto">
                <CheckCircle2 className="h-3 w-3" />
                Semilla revelada
              </Badge>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {result.winners.map((winner) => (
                <div
                  key={winner.position}
                  className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold">
                      {localPrizeLabel(winner.position, commitment.prizeNames)}
                    </p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-brand-accent">
                      {pad4(winner.number)}
                    </p>
                  </div>
                  <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-fg-subtle">
                    hash: {winner.hash}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
                  Semilla revelada
                </p>
                <div className="mt-1 flex items-start gap-2">
                  <code className="block min-w-0 flex-1 break-all rounded-md border border-hairline bg-panel-1/70 p-2 font-mono text-[10px] text-fg-muted">
                    {commitment.seed}
                  </code>
                  <CopyChip value={commitment.seed} />
                </div>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
                  Huellas
                </p>
                <dl className="mt-1 space-y-1.5 text-[10px]">
                  <div>
                    <dt className="text-fg-faint">numbers_hash</dt>
                    <dd className="break-all font-mono text-fg-muted">
                      {result.numbersHash}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-faint">results_hash</dt>
                    <dd className="break-all font-mono text-fg-muted">
                      {result.resultsHash}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <p
              className={cn(
                "mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[11px]",
                commitmentOk
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {commitmentOk ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Hash className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {commitmentOk
                ? "El compromiso publicado coincide con la semilla revelada."
                : "El compromiso no coincide: esta simulación no sería verificable."}
            </p>

            <details className="mt-3 rounded-lg border border-hairline bg-panel-1/50 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-fg">
                <Hash
                  className="h-3.5 w-3.5 text-brand-accent"
                  aria-hidden="true"
                />
                Cómo se calculó, paso a paso
              </summary>
              <div className="mt-3 space-y-3 text-[11px] leading-relaxed text-fg-subtle">
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>
                    Se genera una semilla secreta y se publica su hash: el
                    compromiso.
                  </li>
                  <li>
                    Se canonicaliza el listado de números vendidos: ascendente,
                    sin repetidos, separado por comas.
                  </li>
                  <li>
                    Se calcula el hash de la semilla junto con el listado. Los
                    primeros 15 caracteres hex se pasan a entero y se dividen
                    por la cantidad de números; el resto es la posición del
                    ganador.
                  </li>
                  <li>
                    Para los premios siguientes se repite con los números
                    restantes y el prefijo{" "}
                    <code className="font-mono">|prize:i|</code>, así nunca se
                    repite un ganador.
                  </li>
                  <li>
                    Se publica la semilla. Cualquiera puede recalcular el
                    compromiso y comprobar que coincide.
                  </li>
                </ol>

                <div className="rounded-md border border-hairline bg-panel-1/70 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
                    Cadena del 1.er premio
                  </p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-fg-muted">
                    {`${DRAW_DOMAIN}|raffle:${commitment.runId}|seed:${commitment.seed}|numbers:${result.list}`}
                  </pre>
                </div>

                <p>
                  El simulador usa la misma fórmula que el motor real. La única
                  diferencia es dónde corre: acá todo se calcula en tu navegador,
                  sin consultar la base.
                </p>
              </div>
            </details>
          </div>

          <MultiPrizeVerifier
            raffleId={commitment.runId}
            seed={commitment.seed}
            commitment={commitment.hash}
            numbers={commitment.numbers}
            numbersHash={result.numbersHash}
            winners={result.winners}
            resultsHash={result.resultsHash}
          />
        </div>
      )}

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
        No toca sorteos reales · hash calculado en tu navegador
      </p>
    </div>
  );
}

/**
 * Simulador en dos fases, igual al flujo real:
 *   1) publicar el compromiso (hash de la semilla, sin revelarla)
 *   2) ejecutar el sorteo y revelar la semilla + huellas
 *
 * Multi-premio: el premio 1 usa la fórmula del motor real; los siguientes se
 * calculan sobre los números restantes, sin repetir ganadores. Cada premio
 * tiene su hash y se guarda un results_hash combinado.
 */
function SandboxDrawRemote({
  verifyUrl = "/admin/super/sandbox",
}: {
  /** URL que se imprime en los certificados descargables. */
  verifyUrl?: string;
}) {
  const supabase = useRef(createClient()).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [phase, setPhase] = useState<
    "idle" | "committed" | "spinning" | "done"
  >("idle");
  const [numberCount, setNumberCount] = useState(100);
  const [prizeCount, setPrizeCount] = useState(1);
  const [display, setDisplay] = useState<number | null>(null);
  const [commitment, setCommitment] = useState<SandboxCommitment | null>(null);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  // Si baja la cantidad de números, los premios no pueden superarla.
  useEffect(() => {
    setPrizeCount((current) =>
      Math.min(current, Math.max(1, Math.min(MAX_PRIZES, numberCount))),
    );
  }, [numberCount]);

  const safeNumbers = Math.max(1, Math.min(MAX_NUMBERS, numberCount || 1));
  const safePrizes = Math.max(
    1,
    Math.min(MAX_PRIZES, safeNumbers, prizeCount || 1),
  );

  function animateTo(target: number) {
    setPhase("spinning");
    let tick = 0;
    const total = 42;

    const step = () => {
      tick += 1;

      if (tick < total) {
        setDisplay(1 + Math.floor(Math.random() * safeNumbers));
        const delay = 45 + Math.pow(tick / total, 3) * 130;
        timers.current.push(setTimeout(step, delay));
        return;
      }

      setDisplay(target);
      timers.current.push(setTimeout(() => setPhase("done"), 700));
    };

    step();
  }

  async function publishCommitment() {
    setBusy(true);
    setError(null);
    setResult(null);
    setDisplay(null);
    setPhase("idle");

    const { data, error: rpcError } = await supabase.rpc(
      "create_sandbox_commitment_v2",
      { p_count: safeNumbers, p_prizes: safePrizes },
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | SandboxCommitment
      | null;

    if (!row?.run_id) {
      setError("La simulación no pudo crear el compromiso.");
      return;
    }

    setCommitment(row);
    setPhase("committed");
  }

  async function executeDraw() {
    if (!commitment) return;

    setBusy(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "execute_sandbox_draw_v2",
      { p_run_id: commitment.run_id },
    );

    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | SandboxResult
      | null;

    if (!row?.winning_number) {
      setError("La simulación no devolvió un ganador.");
      return;
    }

    setResult(row);
    animateTo(row.winning_number);
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("idle");
    setDisplay(null);
    setCommitment(null);
    setResult(null);
    setError(null);
  }

  const activeNumbers = result?.numbers_count ?? commitment?.numbers_count ?? safeNumbers;
  const activePrizes = result?.prizes_count ?? commitment?.prizes_count ?? safePrizes;
  const allNumbers = result?.numbers
    ? result.numbers.split(",").map(Number)
    : Array.from({ length: activeNumbers }, (_, index) => index + 1);
  const visibleNumbers = Math.min(activeNumbers, VISIBLE_NUMBERS);

  function prizeLabel(position: number): string {
    return position === 1 ? "1.er premio" : `${position}º premio`;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">Escenario de la simulación</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Números */}
          <div className="space-y-2">
            <label
              htmlFor="sandbox-numbers"
              className="text-xs font-medium text-muted-foreground"
            >
              Cantidad de números (1 a 10.000)
            </label>
            <Input
              id="sandbox-numbers"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_NUMBERS}
              value={numberCount}
              disabled={phase !== "idle"}
              onChange={(event) =>
                setNumberCount(Number(event.target.value) || 1)
              }
              className="text-center font-mono"
            />
            <div className="flex flex-wrap gap-1.5">
              {NUMBER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={phase !== "idle"}
                  onClick={() => setNumberCount(preset)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors disabled:opacity-40",
                    numberCount === preset
                      ? "border-brand-500 bg-brand-500/10 text-fg"
                      : "border-hairline text-muted-foreground hover:text-fg",
                  )}
                >
                  {preset.toLocaleString("es-AR")}
                </button>
              ))}
            </div>
          </div>

          {/* Premios: stepper + atajos, sin pelear con el teclado */}
          <div className="space-y-2">
            <label
              htmlFor="sandbox-prizes"
              className="text-xs font-medium text-muted-foreground"
            >
              Cantidad de premios (1 a 50, sin repetir ganador)
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Un premio menos"
                disabled={phase !== "idle" || prizeCount <= 1}
                onClick={() => setPrizeCount((current) => Math.max(1, current - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="sandbox-prizes"
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.min(MAX_PRIZES, safeNumbers)}
                value={prizeCount}
                disabled={phase !== "idle"}
                onChange={(event) =>
                  setPrizeCount(Number(event.target.value) || 1)
                }
                className="text-center font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Un premio más"
                disabled={
                  phase !== "idle" ||
                  prizeCount >= Math.min(MAX_PRIZES, safeNumbers)
                }
                onClick={() => setPrizeCount((current) => current + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRIZE_PRESETS.filter(
                (preset) => preset <= Math.min(MAX_PRIZES, safeNumbers),
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={phase !== "idle"}
                  onClick={() => setPrizeCount(preset)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors disabled:opacity-40",
                    prizeCount === preset
                      ? "border-brand-500 bg-brand-500/10 text-fg"
                      : "border-hairline text-muted-foreground hover:text-fg",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Escenario aislado: {activeNumbers.toLocaleString("es-AR")} números y{" "}
          {activePrizes} premio{activePrizes === 1 ? "" : "s"}. No toca sorteos
          reales ni números en venta.
        </p>

        {visibleNumbers < activeNumbers && (
          <p className="text-xs text-muted-foreground">
            Se muestran los primeros {VISIBLE_NUMBERS} números de{" "}
            {activeNumbers.toLocaleString("es-AR")}.
          </p>
        )}

        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {Array.from({ length: visibleNumbers }, (_, index) => index + 1).map(
            (number) => {
              const winner = result?.winners.find(
                (item) => item.number === number,
              );
              return (
                <span
                  key={number}
                  title={winner ? prizeLabel(winner.position) : undefined}
                  className={
                    winner
                      ? "rounded bg-brand-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink"
                      : "rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  }
                >
                  {number}
                </span>
              );
            },
          )}
        </div>
      </div>

      <div className="relative rounded-2xl border border-white/10 bg-ink p-6 text-center text-white">
        <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-20" />
        <p className="relative text-xs uppercase tracking-[0.3em] text-brand-accent">
          Simulador de sorteo
        </p>
        <p className="relative mt-3 font-mono text-5xl font-black tabular-nums sm:text-6xl">
          {display != null ? String(display).padStart(4, "0") : "----"}
        </p>
        <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
          {phase === "idle" && (
            <Button onClick={() => void publishCommitment()} disabled={busy}>
              <Lock className="mr-2 h-4 w-4" />
              {busy ? "Publicando…" : "1. Publicar compromiso"}
            </Button>
          )}
          {phase === "committed" && (
            <Button onClick={() => void executeDraw()} disabled={busy}>
              <Play className="mr-2 h-4 w-4" />
              {busy ? "Sorteando…" : "2. Ejecutar sorteo"}
            </Button>
          )}
          {phase === "done" && (
            <>
              <p className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm">
                <Trophy className="h-4 w-4 text-brand-accent" />
                {activePrizes} premio{activePrizes === 1 ? "" : "s"} sorteado
                {activePrizes === 1 ? "" : "s"}
              </p>
              <Button variant="secondary" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Otra simulación
              </Button>
            </>
          )}
        </div>
        {error && (
          <p className="relative mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
      </div>

      {commitment && phase !== "done" && (
        <div className="space-y-2 rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-brand-800 dark:text-brand-300" />
            Paso 1 completado: compromiso publicado
          </p>
          <p className="text-xs text-muted-foreground">
            La semilla está guardada y nadie la ve todavía. El hash ya quedó
            fijo para todos los premios: cuando se ejecute, cualquier cambio en
            la semilla o en los números haría que los hashes no coincidan.
          </p>
          <div>
            <p className="text-xs font-medium">Compromiso (hash de la semilla)</p>
            <code className="mt-1 block break-all rounded-md bg-muted/60 p-3 font-mono text-xs">
              {commitment.commitment}
            </code>
          </div>
        </div>
      )}

      {result && phase === "done" && (
        <div className="space-y-4 rounded-xl border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              Resultado de la simulación
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              Semilla revelada y verificable
            </span>
          </div>

          <div className="space-y-2">
            {result.winners.map((winner) => (
              <div
                key={winner.position}
                className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {prizeLabel(winner.position)}
                  </p>
                  <p className="font-mono text-2xl font-bold text-brand-800 dark:text-brand-200">
                    {String(winner.number).padStart(4, "0")}
                  </p>
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  hash: {winner.hash}
                </p>
              </div>
            ))}
          </div>

          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Compromiso</dt>
              <dd className="break-all font-mono">{result.commitment}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Semilla revelada</dt>
              <dd className="break-all font-mono">{result.seed}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">numbers_hash</dt>
              <dd className="break-all font-mono">{result.numbers_hash}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                result_hash (1.er premio)
              </dt>
              <dd className="break-all font-mono">{result.result_hash}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">
                results_hash (todos los premios)
              </dt>
              <dd className="break-all font-mono">{result.results_hash}</dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            Fórmula: premio 1 con la misma selección del motor real; premios
            siguientes con SHA-256 sobre los números restantes (sin repetir
            ganador). Cada premio guarda su hash y el conjunto tiene un
            results_hash.
          </p>

          <MultiPrizeVerifier
            raffleId={commitment?.run_id ?? ""}
            seed={result.seed}
            commitment={result.commitment}
            numbers={allNumbers}
            numbersHash={result.numbers_hash}
            winners={result.winners}
            resultsHash={result.results_hash}
          />

          <div className="space-y-3">
            <p className="text-sm font-semibold">Certificados por premio</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {result.winners.map((winner) => (
                <div
                  key={winner.position}
                  className="flex flex-col gap-2 rounded-lg border border-hairline bg-panel-2/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {prizeLabel(winner.position)}
                    </p>
                    <p className="font-mono text-lg font-bold tabular-nums">
                      {String(winner.number).padStart(4, "0")}
                    </p>
                  </div>
                  <WinnerCertificate
                    raffleTitle={`Simulación de ${result.numbers_count} números`}
                    prizeLabel={prizeLabel(winner.position)}
                    winnerName="Participante simulado"
                    winnerNumber={winner.number}
                    drawnAt={new Date().toLocaleString("es-AR")}
                    verificationHash={winner.hash}
                    verifyUrl={verifyUrl}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** `SandboxDraw mode="local"` suelto, sin la pestaña de ceremonia. */
function SandboxDrawLocalStandalone() {
  const [scenario, setScenario] = useState<LocalScenario>(
    initialLocalScenario,
  );

  return (
    <SandboxDrawLocal
      scenario={scenario}
      updateScenario={(updater) => setScenario(updater)}
    />
  );
}

export interface SandboxDrawProps {
  /**
   * `local`: mesa de pruebas educativa, 100% en el navegador (página pública).
   * `remote`: sandbox del panel superadmin, que ejecuta los RPCs reales.
   */
  mode?: "local" | "remote";
  /** URL que se imprime en los certificados descargables (solo modo remote). */
  verifyUrl?: string;
}

/**
 * Punto de entrada del simulador. Mantiene el sandbox del panel intacto y
 * suma la variante local que recupera /como-funciona sin tocar base ni motor.
 */
export function SandboxDraw({
  mode = "remote",
  verifyUrl = "/admin/super/sandbox",
}: SandboxDrawProps = {}) {
  if (mode === "local") {
    return <SandboxDrawLocalStandalone />;
  }

  return <SandboxDrawRemote verifyUrl={verifyUrl} />;
}
