"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Play, Trophy, Volume2, VolumeX } from "lucide-react";

import { drawWinner } from "@/app/admin/sorteos/[id]/actions";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";

export interface LiveWinner {
  position: number;
  number: number;
  name: string | null;
  prizeTitle: string | null;
}

interface LiveDrawAnimationProps {
  raffleId: string;
  initialStatus: string;
  initialWinner: number | null;
  /** 0058: ganadores ya guardados en raffle_winners (multipremio). */
  initialWinners?: LiveWinner[];
  soldCount: number;
  /** El usuario actual puede sortear (organizador dueño o superadmin). */
  canDraw: boolean;
  hasCommitment: boolean;
  /** Muestra de números vendidos para el ciclo de la animación. */
  sampleNumbers: number[];
  /** Solo desarrollo: dispara una secuencia falsa de 3 premios. */
  demoWinners?: LiveWinner[];
  /** Simulador público: no toca Supabase y espera un clic para arrancar. */
  isDemo?: boolean;
  simulatedWinners?: LiveWinner[];
  /**
   * Solo demo: nombres de los premios para la vista previa. Si no llegan
   * ganadores ya calculados, la animación elige números únicamente del array
   * `sampleNumbers` y usa estos nombres.
   */
  demoPrizeNames?: string[];
}

type Phase = "idle" | "countdown" | "spinning" | "done";

interface ConfettiOrigin {
  x: number;
  y: number;
}

const CONFETTI_COLORS = ["#F5B301", "#FFD23A", "#FFF0B8", "#FFFFFF"];

const TICKS_TOTALES = 40;
const TICKS_RAPIDOS = 30;
const TICK_RAPIDO_MS = 50;
const TICK_FINAL_MS = 400;
const PAUSA_REVELADO_MS = 2000;
const PAUSA_ENTRE_PREMIOS_MS = 2000;

/** Curva de suspenso: ráfaga inicial y frenada progresiva en los últimos 10. */
function retrasoTick(tick: number): number {
  if (tick <= TICKS_RAPIDOS) return TICK_RAPIDO_MS;
  const avance = (tick - TICKS_RAPIDOS) / (TICKS_TOTALES - TICKS_RAPIDOS);
  return TICK_RAPIDO_MS + avance * avance * (TICK_FINAL_MS - TICK_RAPIDO_MS);
}

/** Tono corto con envolvente: base de los ticks, la cuenta y la fanfarria. */
function sonarTono(
  ctx: AudioContext,
  frecuencia: number,
  inicio: number,
  duracion: number,
  volumen: number,
  tipo: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, inicio);
  gain.gain.setValueAtTime(0.0001, inicio);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(volumen, 0.0002),
    inicio + 0.008,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  osc.connect(gain).connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + duracion + 0.02);
}

/** Golpe seco de la ruleta. */
function sonarTick(ctx: AudioContext, intensidad: number) {
  sonarTono(
    ctx,
    1400 + intensidad * 600,
    ctx.currentTime,
    0.045,
    0.035 * intensidad,
    "square",
  );
}

/** Redoble de tambor sintetizado con ruido y filtro pasa-bajos. */
function sonarRedoble(ctx: AudioContext, intensidad: number) {
  const ahora = ctx.currentTime;
  const duracion = 0.14;
  const muestras = Math.max(1, Math.floor(ctx.sampleRate * duracion));
  const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
  const datos = buffer.getChannelData(0);

  for (let i = 0; i < muestras; i += 1) {
    const caida = 1 - i / muestras;
    datos[i] = (Math.random() * 2 - 1) * caida * caida;
  }

  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.setValueAtTime(140 + intensidad * 160, ahora);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22 * intensidad, ahora);
  gain.gain.exponentialRampToValueAtTime(0.0001, ahora + duracion);
  fuente.connect(filtro).connect(gain).connect(ctx.destination);
  fuente.start(ahora);
}

/** Fanfarria "ta-da!": arpegio mayor y, en el cierre, acorde + destello. */
function sonarVictoria(ctx: AudioContext, final = false) {
  const ahora = ctx.currentTime;
  const notas = [523.25, 659.25, 783.99, 1046.5];

  notas.forEach((frecuencia, indice) => {
    sonarTono(
      ctx,
      frecuencia,
      ahora + indice * 0.1,
      final ? 0.55 : 0.3,
      0.09,
      "triangle",
    );
  });

  if (!final) return;

  notas.forEach((frecuencia) => {
    sonarTono(ctx, frecuencia, ahora + 0.46, 0.8, 0.06);
  });
  sonarTono(ctx, 2093, ahora + 0.5, 0.65, 0.03);
}

/** Beep de la cuenta regresiva; el 1 suena más agudo. */
function sonarCuenta(ctx: AudioContext, numero: number) {
  sonarTono(
    ctx,
    numero === 1 ? 880 : 440,
    ctx.currentTime,
    0.09,
    0.045,
    "triangle",
  );
}

/** Respeta la preferencia del sistema también antes de importar el paquete. */
function prefiereMenosMovimiento(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Lluvia de confeti del "Modo Ceremonia".
 * - `premio`: una ráfaga corta desde el número revelado.
 * - `final`: el cierre, con dos cañones laterales.
 * El paquete se importa recién cuando hace falta y nunca corre en SSR.
 */
function lanzarConfeti(tipo: "premio" | "final", origen?: ConfettiOrigin) {
  if (prefiereMenosMovimiento()) return;

  void import("canvas-confetti").then(({ default: confetti }) => {
    const base = {
      colors: CONFETTI_COLORS,
      disableForReducedMotion: true,
      zIndex: 80,
    };

    if (tipo === "final") {
      confetti({
        ...base,
        particleCount: 180,
        spread: 100,
        startVelocity: 46,
        origin: { x: 0.5, y: 0.4 },
        ticks: 220,
      });
      window.setTimeout(() => {
        confetti({
          ...base,
          particleCount: 80,
          angle: 60,
          spread: 65,
          startVelocity: 40,
          origin: { x: 0, y: 0.7 },
        });
        confetti({
          ...base,
          particleCount: 80,
          angle: 120,
          spread: 65,
          startVelocity: 40,
          origin: { x: 1, y: 0.7 },
        });
      }, 180);
      return;
    }

    confetti({
      ...base,
      particleCount: 90,
      spread: 75,
      startVelocity: 34,
      origin: origen ?? { x: 0.5, y: 0.45 },
      ticks: 170,
      scalar: 0.95,
    });
  });
}

/**
 * Capas visuales del Modo Ceremonia. Viven en este archivo para no tocar
 * `globals.css`: luces, ruleta, cuenta regresiva, revelado y podio.
 * Todas se apagan con `prefers-reduced-motion`.
 */
const CEREMONIA_CSS = `
  .ceremonia-stage::before {
    content: "";
    position: absolute;
    z-index: -1;
    top: -2.5rem;
    left: -1.5rem;
    right: -1.5rem;
    height: 24rem;
    pointer-events: none;
    background: radial-gradient(
      ellipse 55% 60% at 50% 0%,
      rgba(245, 179, 1, 0.28),
      rgba(245, 179, 1, 0.08) 45%,
      transparent 72%
    );
    filter: blur(52px);
  }

  /* Focos y viñeta: capa teatral sobre la tarjeta, debajo del contenido. */
  .ceremonia-fx {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    border-radius: inherit;
  }

  .ceremonia-spot {
    position: absolute;
    left: 50%;
    top: -65%;
    width: 140%;
    height: 160%;
    transform: translateX(-50%);
    background:
      linear-gradient(
        112deg,
        transparent 38%,
        rgba(245, 179, 1, 0.12) 48%,
        transparent 52%
      ),
      linear-gradient(
        248deg,
        transparent 38%,
        rgba(245, 179, 1, 0.1) 48%,
        transparent 52%
      ),
      radial-gradient(
        ellipse 40% 55% at 50% 18%,
        rgba(255, 214, 102, 0.2),
        transparent 70%
      );
    filter: blur(16px);
    opacity: 0;
    transition: opacity 0.6s ease;
  }

  .ceremonia-fx[data-show="true"] .ceremonia-spot {
    opacity: 1;
    animation: ceremonia-sway 7s ease-in-out infinite alternate;
  }

  @keyframes ceremonia-sway {
    from {
      transform: translateX(-50%) rotate(-4deg);
    }
    to {
      transform: translateX(-50%) rotate(4deg);
    }
  }

  .ceremonia-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse 62% 58% at 50% 46%,
      transparent 30%,
      rgba(0, 0, 0, 0.58) 100%
    );
    opacity: 0;
    transition: opacity 0.6s ease;
  }

  .light .ceremonia-vignette {
    background: radial-gradient(
      ellipse 62% 58% at 50% 46%,
      transparent 32%,
      rgba(20, 19, 15, 0.22) 100%
    );
  }

  .ceremonia-fx[data-show="true"] .ceremonia-vignette {
    opacity: 1;
  }

  .ceremonia-fx[data-reveal="true"] {
    animation: ceremonia-stage-flash 0.7s ease-out both;
  }

  @keyframes ceremonia-stage-flash {
    0% {
      box-shadow: inset 0 0 100px 12px rgba(245, 179, 1, 0.34);
    }
    100% {
      box-shadow: inset 0 0 0 0 rgba(245, 179, 1, 0);
    }
  }

  .ceremonia-reel {
    animation: ceremonia-reel 0.26s ease-in-out infinite;
    will-change: transform, filter;
  }

  @keyframes ceremonia-reel {
    0%,
    100% {
      transform: translateY(-3%) scale(1.02);
      filter: blur(2px);
      opacity: 0.85;
    }
    50% {
      transform: translateY(4%) scale(0.97);
      filter: blur(8px);
      opacity: 0.6;
    }
  }

  .ceremonia-reveal {
    animation: ceremonia-reveal 0.7s cubic-bezier(0.2, 0.9, 0.25, 1.2) both;
  }

  @keyframes ceremonia-reveal {
    0% {
      transform: scale(0.82);
      filter: blur(10px) brightness(1.3);
      text-shadow: 0 0 0 rgba(245, 179, 1, 0);
    }
    55% {
      transform: scale(1.18);
      filter: blur(0) brightness(1.35);
      text-shadow: 0 0 46px rgba(245, 179, 1, 0.75);
    }
    100% {
      transform: scale(1);
      filter: blur(0) brightness(1);
      text-shadow: 0 0 20px rgba(245, 179, 1, 0.3);
    }
  }

  /* Latido del número en cada tick lento; se reinicia al cambiar la key. */
  .ceremonia-beat {
    display: inline-block;
    animation: ceremonia-beat 0.22s cubic-bezier(0.2, 0.9, 0.25, 1.2);
  }

  @keyframes ceremonia-beat {
    0% {
      transform: scale(1);
    }
    45% {
      transform: scale(1.14);
    }
    100% {
      transform: scale(1);
    }
  }

  /* Pausa de 2 s antes del revelado: el número queda en primer plano. */
  .ceremonia-hold {
    transform: scale(1.05);
    filter: brightness(1.15);
    transition: transform 0.35s ease, filter 0.35s ease;
  }

  .ceremonia-count {
    animation: ceremonia-count 0.8s cubic-bezier(0.2, 0.9, 0.25, 1.2) both;
  }

  @keyframes ceremonia-count {
    0% {
      opacity: 0;
      transform: scale(1.65);
      filter: blur(10px);
    }
    40% {
      opacity: 1;
      transform: scale(1);
      filter: blur(0);
    }
    100% {
      opacity: 0.92;
      transform: scale(0.96);
      filter: blur(0);
    }
  }

  .ceremonia-flash {
    animation: ceremonia-flash 0.85s ease-out both;
  }

  @keyframes ceremonia-flash {
    0% {
      opacity: 0.9;
      transform: scale(0.65);
    }
    100% {
      opacity: 0;
      transform: scale(1.6);
    }
  }

  .ceremonia-rise {
    animation: ceremonia-rise 0.45s cubic-bezier(0.2, 0.9, 0.25, 1.2) both;
  }

  @keyframes ceremonia-rise {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ceremonia-stage::before {
      filter: none;
      opacity: 0.55;
    }

    .ceremonia-reel,
    .ceremonia-reveal,
    .ceremonia-beat,
    .ceremonia-hold,
    .ceremonia-count,
    .ceremonia-rise {
      animation: none;
      filter: none;
      transform: none;
      transition: none;
    }

    .ceremonia-spot {
      animation: none;
    }

    .ceremonia-fx[data-reveal="true"] {
      animation: none;
      box-shadow: none;
    }

    .ceremonia-flash {
      display: none;
    }
  }
`;

function nombreCorto(fullName: string | null): string {
  const partes = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Participante";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

/**
 * Vista previa del modo demo: elige números SOLO del array vendido recibido y
 * les asigna los nombres configurados. Es imposible que invente un número
 * fuera del límite: nunca lee otro rango ni usa `soldCount` como máximo.
 */
function generarGanadoresDemo(
  sampleNumbers: number[],
  prizeNames: string[],
): LiveWinner[] {
  const pool = [...new Set(sampleNumbers)].filter(
    (number) => Number.isFinite(number) && number > 0,
  );

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }

  const total = Math.min(prizeNames.length || 3, pool.length);

  return Array.from({ length: total }, (_, index) => ({
    position: index + 1,
    number: pool[index],
    name: "Participante simulado",
    prizeTitle: prizeNames[index]?.trim() || `Premio ${index + 1}`,
  }));
}

/**
 * Sala de sorteo en vivo.
 *
 * - Un premio: se comporta como siempre (un único número).
 * - Multipremio (0058): anima cada posición en orden, 2 s de pausa entre
 *   premios, y va llenando el podio. Los números los elige la base; la
 *   animación solo los revela.
 * - "Modo Ceremonia": luz ambiental, cuenta regresiva 3-2-1, ruleta con blur,
 *   confeti al revelar y podio destacado. Son capas visuales: no cambian las
 *   props ni la lógica del sorteo.
 */
export function LiveDrawAnimation({
  raffleId,
  initialStatus,
  initialWinner,
  initialWinners = [],
  soldCount,
  canDraw,
  hasCommitment,
  sampleNumbers,
  demoWinners = [],
  isDemo = false,
  simulatedWinners = [],
  demoPrizeNames = [],
}: LiveDrawAnimationProps) {
  const supabase = useRef(createClient()).current;
  const animated = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const samples = useRef(sampleNumbers);
  const numberRef = useRef<HTMLParagraphElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>(
    initialStatus === "drawn"
      ? initialWinners.length > 0 || initialWinner != null
        ? "done"
        : "idle"
      : "idle",
  );
  const [display, setDisplay] = useState<number | null>(initialWinner);
  const [winner, setWinner] = useState<number | null>(initialWinner);
  const [podium, setPodium] = useState<LiveWinner[]>(
    initialStatus === "drawn" ? initialWinners : [],
  );
  const [currentPrize, setCurrentPrize] = useState<LiveWinner | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [slowPhase, setSlowPhase] = useState(false);
  const [holding, setHolding] = useState(false);
  const [beatKey, setBeatKey] = useState(0);

  useEffect(() => {
    samples.current = sampleNumbers;
  }, [sampleNumbers]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const limpiarTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  /**
   * Demo: si la mesa de pruebas ya calculó ganadores, se usan esos; si no,
   * se genera una vista previa con el array vendido y los nombres recibidos.
   */
  const ganadoresDemo = useCallback(
    () =>
      simulatedWinners.length > 0
        ? simulatedWinners
        : generarGanadoresDemo(sampleNumbers, demoPrizeNames),
    [simulatedWinners, sampleNumbers, demoPrizeNames],
  );

  /** Crea o reanuda el AudioContext: siempre después de un gesto del usuario. */
  const asegurarAudio = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctor = window.AudioContext;
      if (!Ctor) return null;
      try {
        audioRef.current = new Ctor();
      } catch {
        // Si el navegador bloquea el audio, el sorteo debe seguir igual.
        return null;
      }
    }
    if (audioRef.current.state === "suspended") {
      void audioRef.current.resume().catch(() => {});
    }
    return audioRef.current;
  }, []);

  // Al desmontar: cortar timers y cerrar el audio para que no siga sonando.
  useEffect(() => {
    return () => {
      limpiarTimers();
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
    };
  }, [limpiarTimers]);

  /** Busca en la base los ganadores definitivos (multipremio). */
  const cargarGanadores = useCallback(async (): Promise<LiveWinner[]> => {
    const { data } = await supabase
      .from("raffle_winners")
      .select("position, number, user_name, prize_title")
      .eq("raffle_id", raffleId)
      .order("position", { ascending: true });

    return (data ?? []).map((fila) => ({
      position: Number(fila.position),
      number: Number(fila.number),
      name: (fila.user_name as string | null) ?? null,
      prizeTitle: (fila.prize_title as string | null) ?? null,
    }));
  }, [raffleId, supabase]);

  /**
   * Secuencia: cuenta 3-2-1, ruleta con frenada de suspenso (50 ms → 400 ms
   * en los últimos 10 números), 2 s de pausa antes de revelar, confeti,
   * fanfarria y podio. Los sonidos se sintetizan con Web Audio y se pueden
   * silenciar sin cortar la animación.
   */
  const runSequence = useCallback(
    (lista: LiveWinner[]) => {
      if (animated.current || lista.length === 0) return;
      animated.current = true;

      const audio = asegurarAudio();
      const numeros = samples.current.length > 0 ? samples.current : [1];
      const tocar = (accion: (ctx: AudioContext) => void) => {
        if (!mutedRef.current && audio && audio.state === "running") {
          try {
            accion(audio);
          } catch {
            // El audio es decorativo: nunca debe cortar la secuencia.
          }
        }
      };

      const animarPremio = (indice: number) => {
        const premio = lista[indice];
        if (!premio) {
          setPhase("done");
          setCurrentPrize(null);
          setCountdown(null);
          setSlowPhase(false);
          setHolding(false);
          lanzarConfeti("final");
          tocar((ctx) => sonarVictoria(ctx, true));
          return;
        }

        setCurrentPrize(premio);
        setRevealed(false);
        setSlowPhase(false);
        setHolding(false);
        let tick = 0;

        const revelar = () => {
          setDisplay(premio.number);
          setWinner(premio.number);
          setRevealed(true);
          setSlowPhase(false);
          setHolding(false);
          setBeatKey((clave) => clave + 1);
          setRevealKey((clave) => clave + 1);
          setPodium((prev) => [
            ...prev.filter((p) => p.position !== premio.position),
            premio,
          ]);

          const rect = numberRef.current?.getBoundingClientRect();
          const origen =
            rect && typeof window !== "undefined"
              ? {
                  x:
                    (rect.left + rect.width / 2) /
                    Math.max(window.innerWidth, 1),
                  y:
                    (rect.top + rect.height / 2) /
                    Math.max(window.innerHeight, 1),
                }
              : undefined;
          lanzarConfeti("premio", origen);
          tocar((ctx) => sonarVictoria(ctx));

          timers.current.push(
            setTimeout(
              () => animarPremio(indice + 1),
              PAUSA_ENTRE_PREMIOS_MS,
            ),
          );
        };

        const girar = () => {
          tick += 1;
          if (tick > TICKS_TOTALES) return;

          setDisplay(numeros[Math.floor(Math.random() * numeros.length)]);

          if (tick > TICKS_RAPIDOS) {
            const avance =
              (tick - TICKS_RAPIDOS) / (TICKS_TOTALES - TICKS_RAPIDOS);
            setSlowPhase(true);
            setBeatKey((clave) => clave + 1);
            tocar((ctx) => sonarRedoble(ctx, 0.35 + avance * 0.65));
          } else if (tick % 2 === 0) {
            tocar((ctx) => sonarTick(ctx, 0.5 + (tick / TICKS_RAPIDOS) * 0.4));
          }

          if (tick === TICKS_TOTALES) {
            setHolding(true);

            // Redoble continuo durante la pausa de 2 s: cada golpe late el número.
            const pasos = Math.floor(PAUSA_REVELADO_MS / 90);
            for (let paso = 0; paso < pasos; paso += 1) {
              timers.current.push(
                setTimeout(() => {
                  if (
                    !mutedRef.current &&
                    audio &&
                    audio.state === "running"
                  ) {
                    try {
                      sonarRedoble(audio, 0.45 + (paso / pasos) * 0.55);
                      setBeatKey((clave) => clave + 1);
                    } catch {
                      // El redoble es decorativo: la secuencia sigue.
                    }
                  }
                }, paso * 90),
              );
            }

            timers.current.push(setTimeout(revelar, PAUSA_REVELADO_MS));
            return;
          }

          // La frenada usa el tick siguiente: el último salto tarda 400 ms.
          timers.current.push(setTimeout(girar, retrasoTick(tick + 1)));
        };

        girar();
      };

      // Marco de evento: 3, 2, 1 antes del primer giro.
      setPhase("countdown");
      const descontar = (n: number) => {
        if (n === 0) {
          setCountdown(null);
          setPhase("spinning");
          animarPremio(0);
          return;
        }
        setCountdown(n);
        tocar((ctx) => sonarCuenta(ctx, n));
        timers.current.push(setTimeout(() => descontar(n - 1), 800));
      };
      descontar(3);
    },
    [asegurarAudio],
  );

  const runSingle = useCallback(
    (target: number) => {
      if (animated.current || !Number.isFinite(target)) return;
      runSequence([
        {
          position: 1,
          number: target,
          name: null,
          prizeTitle: null,
        },
      ]);
    },
    [runSequence],
  );

  // Solo desarrollo: permite ver la animación secuencial sin un sorteo real.
  useEffect(() => {
    if (demoWinners.length === 0) return;
    animated.current = false;
    setPhase("idle");
    setPodium([]);
    setCountdown(null);
    setRevealed(false);
    setRevealKey(0);
    setSlowPhase(false);
    setHolding(false);
    setBeatKey(0);
    timers.current.push(
      setTimeout(() => runSequence(demoWinners), 300),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoWinners.length]);

  // Simulador público: sin Realtime ni consultas. Se dispara con el botón.
  // (El modo `demoWinners` de /en-vivo sigue auto-arrancando en desarrollo.)

  // Estado inicial ya sorteado: mostrar el resultado sin repetir la animación.
  useEffect(() => {
    if (initialStatus !== "drawn") return;
    if (initialWinners.length > 0) {
      animated.current = true;
      const ultimo = initialWinners[initialWinners.length - 1];
      setPodium(initialWinners);
      setWinner(ultimo.number);
      setDisplay(ultimo.number);
      setCurrentPrize(ultimo);
      setPhase("done");
      return;
    }
    if (initialWinner != null) {
      animated.current = true;
      setWinner(initialWinner);
      setDisplay(initialWinner);
      setPhase("done");
    }
  }, [initialStatus, initialWinner, initialWinners]);

  // Espectadores: escuchan el UPDATE de `raffles` y animan lo que quedó en base.
  useEffect(() => {
    if (isDemo) return;
    if (initialStatus === "drawn") return;

    const channel = supabase
      .channel(`raffle-live-${raffleId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "raffles",
          filter: `id=eq.${raffleId}`,
        },
        (payload) => {
          const row = payload.new as {
            status?: string;
            winner_number?: number | null;
          };
          if (row.status !== "drawn") return;

          void cargarGanadores().then((lista) => {
            if (lista.length > 0) runSequence(lista);
            else if (typeof row.winner_number === "number") {
              runSingle(row.winner_number);
            }
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      limpiarTimers();
    };
  }, [
    raffleId,
    initialStatus,
    isDemo,
    cargarGanadores,
    runSequence,
    runSingle,
    supabase,
    limpiarTimers,
  ]);

  function reiniciarDemo() {
    asegurarAudio();
    animated.current = false;
    limpiarTimers();
    setPodium([]);
    setWinner(null);
    setDisplay(null);
    setCurrentPrize(null);
    setCountdown(null);
    setRevealed(false);
    setRevealKey(0);
    setSlowPhase(false);
    setHolding(false);
    setBeatKey(0);
    setPhase("idle");
    timers.current.push(
      setTimeout(() => runSequence(ganadoresDemo()), 250),
    );
  }

  function alternarSonido() {
    const siguiente = !muted;
    setMuted(siguiente);
    mutedRef.current = siguiente;
    if (!siguiente) asegurarAudio();
  }

  async function startDraw() {
    asegurarAudio();
    setBusy(true);
    setError(null);

    try {
      // Misma lógica que la Server Action drawWinner: usa draw_winner_multi
      // cuando el sorteo tiene más de un premio y notifica a cada ganador.
      // Antes llamaba execute_transparent_draw, que delega en draw_winner
      // (un solo ganador) y por eso el podio multipremio nunca se llenaba.
      const resultado = await drawWinner(raffleId);

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }

      const lista = await cargarGanadores();
      if (lista.length > 0) {
        runSequence(lista);
        return;
      }

      const number = Number(resultado.winningNumber ?? 0);
      if (!number) {
        setError("El sorteo se ejecutó pero no se pudo leer el ganador.");
        return;
      }
      runSingle(number);
    } catch {
      setError("No se pudo ejecutar el sorteo. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const numberLabel =
    display != null ? String(display).padStart(4, "0") : "----";
  const enJuego = currentPrize
    ? currentPrize.prizeTitle ?? `Premio ${currentPrize.position}`
    : null;

  return (
    <div className="ceremonia-stage relative isolate space-y-5">
      {/* dangerouslySetInnerHTML evita que React compare el texto del CSS
          entre servidor y cliente: el SSR escapaba las comillas y la
          hidratación se rompía con "Text content did not match". */}
      <style dangerouslySetInnerHTML={{ __html: CEREMONIA_CSS }} />

      <div className="relative overflow-hidden rounded-xl border border-hairline bg-panel-1 p-5 text-center shadow-[0_24px_70px_-40px_rgba(245,179,1,0.35)] sm:p-8">
        {/* Focos y viñeta: solo mientras la ruleta está en juego. */}
        <div
          aria-hidden="true"
          className="ceremonia-fx"
          data-show={phase === "spinning" || phase === "countdown"}
          data-reveal={revealed}
        >
          <div className="ceremonia-spot" />
          <div className="ceremonia-vignette" />
        </div>

        <div className="relative z-10">
        {/* Marco de evento en vivo */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 pb-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 animate-live-pulse rounded-full bg-red-500" />
            </span>
            REC
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
              {phase === "done"
                ? "Sorteo finalizado"
                : phase === "countdown"
                  ? "Comenzando"
                  : "Sorteo en vivo"}
            </span>
            <button
              type="button"
              onClick={alternarSonido}
              aria-label={muted ? "Activar sonido" : "Silenciar sonido"}
              aria-pressed={muted}
              title={muted ? "Activar sonido" : "Silenciar sonido"}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-hairline bg-panel-2 text-fg-subtle transition-colors hover:border-hairline-strong hover:text-fg"
            >
              {muted ? (
                <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-accent">
          {phase === "done"
            ? "Resultado final"
            : phase === "countdown"
              ? "Preparando el sorteo"
              : enJuego
                ? `Sorteando · ${enJuego}`
                : "Sorteo en vivo"}
        </p>

        <div className="relative mx-auto mt-4 flex h-[7.5rem] items-center justify-center sm:h-[10rem]">
          {phase === "countdown" && countdown != null ? (
            <div className="flex flex-col items-center" aria-hidden="true">
              <span
                key={countdown}
                className="ceremonia-count flex h-28 w-28 items-center justify-center rounded-full border-2 border-brand/50 bg-brand/10 font-mono text-7xl font-semibold tabular-nums text-brand shadow-[0_0_50px_-12px_rgba(245,179,1,0.65)] sm:h-32 sm:w-32 sm:text-8xl"
              >
                {countdown}
              </span>
              <span className="mt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-fg-subtle">
                El sorteo comienza
              </span>
            </div>
          ) : (
            <p
              ref={numberRef}
              className={[
                "font-mono text-6xl font-medium tabular-nums tracking-[0.08em] sm:text-8xl",
                phase === "done" || revealed
                  ? "text-brand-accent"
                  : "text-fg",
                phase === "spinning" && !revealed && !holding
                  ? "ceremonia-reel"
                  : "",
                holding && !revealed ? "ceremonia-hold" : "",
                revealed ? "ceremonia-reveal" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-live="polite"
            >
              <span
                key={beatKey}
                className={`inline-block ${
                  slowPhase && !revealed ? "ceremonia-beat" : ""
                }`}
              >
                {numberLabel}
              </span>
            </p>
          )}

          {revealKey > 0 && (
            <span
              key={revealKey}
              aria-hidden="true"
              className="ceremonia-flash pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(245,179,1,0.35),transparent_65%)]"
            />
          )}
        </div>

        {phase === "done" && winner != null ? (
          <div className="mt-4 space-y-1">
            <p className="flex items-center justify-center gap-2 text-lg font-semibold">
              <Trophy className="h-5 w-5 text-brand-accent" />
              {podium.length > 1 ? "Ganadores confirmados" : "Número ganador"}
            </p>
            <p className="text-[13px] text-fg-subtle">
              {soldCount} números vendidos participaron.
            </p>
          </div>
        ) : phase === "spinning" ? (
          <p className="mt-4 text-[13px] text-fg-subtle">
            {revealed
              ? "Número revelado. Preparando el siguiente premio…"
              : holding
                ? "El número está por salir…"
                : slowPhase
                  ? "Últimos números: la ruleta está frenando…"
                  : "Mezclando los números vendidos…"}
          </p>
        ) : phase === "countdown" ? (
          <p className="mt-4 text-[13px] text-fg-subtle">
            Luces encendidas: la ceremonia arranca en instantes.
          </p>
        ) : (
          <p className="mt-4 text-[13px] text-fg-subtle">
            {soldCount} número{soldCount === 1 ? "" : "s"} vendido
            {soldCount === 1 ? "" : "s"} en juego.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {isDemo && phase === "idle" && (
            <Button
              size="lg"
              onClick={() => {
                asegurarAudio();
                animated.current = false;
                runSequence(ganadoresDemo());
              }}
            >
              <Play className="mr-2 h-5 w-5" />
              Iniciar Simulación
            </Button>
          )}

          {!isDemo && phase === "idle" && canDraw && hasCommitment && soldCount > 0 && (
            <Button size="lg" onClick={() => void startDraw()} disabled={busy}>
              <Play className="mr-2 h-5 w-5" />
              {busy ? "Iniciando…" : "Iniciar sorteo"}
            </Button>
          )}

          {phase === "idle" && canDraw && !hasCommitment && (
            <p className="text-[13px] text-brand-accent">
              Falta publicar el compromiso del sorteo antes de sortear.
            </p>
          )}

          {phase === "idle" && canDraw && hasCommitment && soldCount === 0 && (
            <p className="text-[13px] text-brand-accent">
              Necesitás al menos un número vendido para sortear.
            </p>
          )}

          {!isDemo && phase === "idle" && !canDraw && (
            <p className="text-[13px] text-fg-subtle">
              Esperando que el organizador inicie el sorteo.
            </p>
          )}

          {phase === "done" &&
            (isDemo ? (
              <Button variant="secondary" size="lg" onClick={reiniciarDemo}>
                <Play className="mr-2 h-4 w-4" />
                Repetir simulación
              </Button>
            ) : (
              <>
                <Link
                  href={`/sorteos/${raffleId}/resultados`}
                  className={buttonVariants({ variant: "default" })}
                >
                  <Trophy className="mr-2 h-4 w-4" />
                  Ver Resultados Oficiales
                </Link>
                <Link
                  href={`/sorteos/${raffleId}/verificar`}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Ver verificación y certificado
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </>
            ))}
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        </div>
      </div>

      {podium.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border border-hairline bg-panel-1/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-accent">
              {phase === "done" ? "Podio final" : "Podio en vivo"}
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
              {podium.length} {podium.length === 1 ? "premio" : "premios"}
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {[...podium]
              .sort((a, b) => a.position - b.position)
              .map((ganador) => {
                const primero = ganador.position === 1;
                const segundo = ganador.position === 2;
                const tercero = ganador.position === 3;

                const fila = primero
                  ? "border-brand/45 bg-gradient-to-r from-brand/15 via-brand/5 to-transparent px-4 py-4 shadow-[0_0_40px_-18px_rgba(245,179,1,0.75)] sm:px-5 sm:py-5"
                  : segundo
                    ? "border-fg/20 bg-gradient-to-r from-fg/10 to-transparent px-3.5 py-3"
                    : tercero
                      ? "border-orange-400/25 bg-gradient-to-r from-orange-400/10 to-transparent px-3.5 py-3"
                      : "border-hairline bg-background/60 px-3 py-2.5";

                const medalla = primero
                  ? "bg-brand text-brand-foreground shadow-glow"
                  : segundo
                    ? "bg-fg/15 text-fg"
                    : tercero
                      ? "bg-orange-400/20 text-orange-700 dark:text-orange-300"
                      : "bg-brand-accent/15 text-brand-accent";

                const etiqueta = primero
                  ? "Oro"
                  : segundo
                    ? "Plata"
                    : tercero
                      ? "Bronce"
                      : null;

                return (
                  <li
                    key={ganador.position}
                    className={`ceremonia-rise flex flex-wrap items-center justify-between gap-2 rounded-lg border ${fila}`}
                    style={{
                      animationDelay: `${Math.min(ganador.position - 1, 5) * 80}ms`,
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex shrink-0 items-center justify-center rounded-full font-mono font-bold ${medalla} ${
                          primero ? "h-9 w-9 text-sm" : "h-7 w-7 text-[11px]"
                        }`}
                      >
                        {ganador.position}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={`font-medium ${
                              primero ? "text-base sm:text-lg" : "text-sm"
                            }`}
                          >
                            {ganador.prizeTitle ??
                              `Premio ${ganador.position}`}
                          </span>
                          {etiqueta && (
                            <span
                              className={`font-mono text-[9px] uppercase tracking-[0.16em] ${
                                primero ? "text-brand-accent" : "text-fg-subtle"
                              }`}
                            >
                              {etiqueta}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-fg-subtle">
                          {nombreCorto(ganador.name)}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`flex items-center gap-2 font-mono tabular-nums text-fg ${
                        primero ? "text-lg sm:text-xl" : "text-sm"
                      }`}
                    >
                      {primero && (
                        <Trophy
                          className="h-4 w-4 text-brand"
                          aria-hidden="true"
                        />
                      )}
                      Nº {String(ganador.number).padStart(4, "0")}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {isDemo
          ? "Demo educativa: la ceremonia usa solo los números vendidos y los premios de tu escenario. No toca sorteos reales."
          : "Los ganadores se calculan en la base con la semilla comprometida antes del sorteo. La animación solo los muestra: no los elige."}
      </p>
    </div>
  );
}
