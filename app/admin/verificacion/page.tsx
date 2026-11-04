"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addressMatches } from "@/lib/address";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { saveKycData, submitKyc } from "@/app/admin/verificacion/actions";

type VerificationStatus = "pending" | "approved" | "rejected";

// El bucket organizer-kyc sólo acepta JPG/PNG de hasta 5 MB (migración 0061).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

/** Valida del lado del cliente; el servidor vuelve a validar. */
function validateImageFile(file: File, label: string): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${label}: subí una imagen JPG o PNG.`;
  }
  if (file.size <= 0) {
    return `${label}: el archivo está vacío.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${label}: la imagen no puede superar los 5 MB.`;
  }
  return null;
}

/**
 * Crea y libera la URL de vista previa del archivo.
 * Se crea dentro del efecto para que StrictMode (doble efecto en desarrollo)
 * no revoque una URL que la vista sigue usando.
 */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

function cameraErrorMessage(error: unknown): string {
  const name =
    error instanceof DOMException
      ? error.name
      : typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name ?? "")
        : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Bloqueaste el acceso a la cámara. Habilitá el permiso de cámara en el navegador o subí una foto de tu selfie.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No encontramos una cámara conectada. Subí una foto de tu selfie desde el celular o la computadora.";
    case "NotReadableError":
    case "TrackStartError":
      return "La cámara está siendo usada por otra aplicación. Cerrá esa app e intentá de nuevo, o subí una foto.";
    case "OverconstrainedError":
      return "La cámara no admite la configuración solicitada. Probá de nuevo o subí una foto de tu selfie.";
    default:
      return "No se pudo abrir la cámara. Revisá los permisos del navegador o subí una foto de tu selfie.";
  }
}

export default function VerificacionPage() {
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [dniNumber, setDniNumber] = useState("");
  const [dniAddress, setDniAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryProvince, setDeliveryProvince] = useState("");
  const [deliveryPostalCode, setDeliveryPostalCode] = useState("");
  const [dataBusy, setDataBusy] = useState(false);

  const [dniFrontFile, setDniFrontFile] = useState<File | null>(null);
  const [dniBackFile, setDniBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [cameraState, setCameraState] = useState<"off" | "starting" | "on">(
    "off",
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dniFrontPreview = useObjectUrl(dniFrontFile);
  const dniBackPreview = useObjectUrl(dniBackFile);
  const selfiePreview = useObjectUrl(selfieFile);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  // El <video> recién existe cuando cameraState === "on": por eso el stream se
  // engancha acá y no dentro de startCamera (antes quedaba en negro).
  useEffect(() => {
    if (cameraState !== "on") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        if (mountedRef.current) {
          setCameraError(
            "La cámara se abrió pero no se pudo reproducir. Probá de nuevo o subí una foto de tu selfie.",
          );
        }
      });
    }
  }, [cameraState]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (active) setLoading(false);
          return;
        }
        const { data } = await supabase
          .from("profiles")
          .select(
            "verification_status, full_name, phone, location, dni_number, dni_address, address_line, city, province, postal_code",
          )
          .eq("id", user.id)
          .single();
        if (active) {
          setStatus((data?.verification_status as VerificationStatus) ?? "pending");
          setFullName(data?.full_name ?? "");
          setPhone(data?.phone ?? "");
          setLocation(data?.location ?? "");
          setDniNumber(data?.dni_number ?? "");
          setDniAddress(data?.dni_address ?? "");
          setDeliveryAddress(data?.address_line ?? "");
          setDeliveryCity(data?.city ?? "");
          setDeliveryProvince(data?.province ?? "");
          setDeliveryPostalCode(data?.postal_code ?? "");
          setLoading(false);
        }
      } catch {
        if (active) {
          setError("No se pudieron cargar tus datos. Recargá la página.");
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  function selectFile(
    event: ChangeEvent<HTMLInputElement>,
    label: string,
    onSelect: (file: File | null) => void,
  ) {
    const file = event.target.files?.[0] ?? null;
    // Permite volver a elegir el mismo archivo después de un error.
    event.target.value = "";
    if (!file) return;

    const problem = validateImageFile(file, label);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSelect(file);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraState("off");
  }

  async function startCamera() {
    setError(null);
    setCameraError(null);

    if (cameraState === "starting" || cameraState === "on") return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Este navegador no permite usar la cámara. Podés subir una foto de tu selfie con el botón de abajo.",
      );
      return;
    }

    setCameraState("starting");
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      if (mountedRef.current) {
        setCameraState("off");
        setCameraError(
          "La cámara tardó demasiado en responder. Probá de nuevo o subí una foto de tu selfie.",
        );
      }
    }, 20000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      // Si el timeout ganó la carrera, el stream llega tarde: se apaga.
      if (settled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      streamRef.current = stream;
      if (mountedRef.current) setCameraState("on");
    } catch (err) {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
      }
      if (mountedRef.current) {
        setCameraState("off");
        setCameraError(cameraErrorMessage(err));
      }
    }
  }

  function captureSelfie() {
    setCameraError(null);
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      setCameraError(
        "La cámara todavía no está lista. Esperá un segundo y volvé a intentar.",
      );
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCameraError(
          "No se pudo procesar la imagen de la cámara. Subí una foto de tu selfie.",
        );
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setCameraError(
              "No se pudo capturar la selfie. Volvé a intentar o subí una foto.",
            );
            return;
          }
          const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
          if (!mountedRef.current) return;
          setSelfieFile(file);
          stopCamera();
        },
        "image/jpeg",
        0.9,
      );
    } catch {
      setCameraError(
        "No se pudo capturar la selfie. Volvé a intentar o subí una foto de tu selfie.",
      );
    }
  }

  const dataComplete =
    fullName.trim().length >= 3 &&
    phone.replace(/\D/g, "").length >= 6 &&
    location.trim().length >= 2 &&
    /^\d{7,9}$/.test(dniNumber.replace(/\./g, "").replace(/\s/g, "")) &&
    dniAddress.trim().length >= 10 &&
    deliveryAddress.trim().length >= 3 &&
    deliveryCity.trim().length >= 2 &&
    deliveryProvince.trim().length >= 2 &&
    deliveryPostalCode.trim().length >= 3 &&
    addressMatches(
      {
        address_line: deliveryAddress,
        city: deliveryCity,
        province: deliveryProvince,
        postal_code: deliveryPostalCode,
        country: "AR",
      },
      dniAddress,
    );

  const docsReady = Boolean(dniFrontFile && dniBackFile && selfieFile);

  async function saveData() {
    setDataBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await saveKycData({
        full_name: fullName,
        phone,
        location,
        dni_number: dniNumber,
        dni_address: dniAddress,
      });

      if (!result.ok) {
        setError(result.error ?? "No se pudieron guardar los datos");
        return;
      }
      setSuccess("Datos personales guardados.");
    } catch {
      setError(
        "No se pudieron guardar los datos (¿sin conexión?). Probá de nuevo.",
      );
    } finally {
      setDataBusy(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    if (!dataComplete) {
      setError(
        "Completá y guardá tus datos personales antes de enviar la solicitud.",
      );
      return;
    }
    if (!dniFrontFile || !dniBackFile || !selfieFile) {
      setError(
        "Para enviar la solicitud necesitás el frente del DNI, el dorso del DNI y la selfie.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("dni_front", dniFrontFile);
      fd.append("dni_back", dniBackFile);
      fd.append("selfie", selfieFile);

      const result = await submitKyc(fd);
      if (!result.ok) {
        setError(result.error ?? "No se pudo enviar la solicitud.");
        return;
      }

      setStatus("pending");
      setSuccess(
        "Solicitud enviada, pendiente de revisión. El superadmin revisará las tres imágenes.",
      );
      setDniFrontFile(null);
      setDniBackFile(null);
      setSelfieFile(null);
      stopCamera();
    } catch {
      setError(
        "No se pudo completar el envío (¿sin conexión?). Tu selección sigue cargada: probá de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const banner =
    status === "approved"
      ? {
          icon: CheckCircle2,
          text: "Identidad verificada. Ya podés publicar sorteos.",
          cls: "text-emerald-700 dark:text-emerald-400",
        }
      : status === "rejected"
        ? {
            icon: XCircle,
            text: "Verificación rechazada. Volvé a enviar tu documentación.",
            cls: "text-destructive",
          }
        : {
            icon: Clock,
            text: "Pendiente de revisión por el superadmin.",
            cls: "text-amber-800 dark:text-amber-300",
          };

  if (loading) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Verificación de identidad
        </h1>
        <p className="text-sm text-muted-foreground">
          Es obligatoria para publicar sorteos. Necesitás tres imágenes
          independientes: frente del DNI, dorso del DNI y selfie.
        </p>
      </header>

      <div
        className={`flex items-center gap-2 rounded-lg border bg-muted/40 p-4 text-sm font-medium ${banner.cls}`}
      >
        <banner.icon className="h-5 w-5 shrink-0" />
        {banner.text}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">0. Datos personales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Estos datos los revisa el superadmin junto con tu DNI. Se guardan
            en tu perfil y no se muestran públicamente.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="kyc-name" className="text-sm font-medium">
                Nombre completo
              </label>
              <Input
                id="kyc-name"
                value={fullName}
                maxLength={80}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="kyc-dni" className="text-sm font-medium">
                Número de DNI
              </label>
              <Input
                id="kyc-dni"
                value={dniNumber}
                inputMode="numeric"
                maxLength={10}
                placeholder="Sin puntos"
                onChange={(event) => setDniNumber(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="kyc-phone" className="text-sm font-medium">
                Teléfono
              </label>
              <Input
                id="kyc-phone"
                value={phone}
                maxLength={30}
                placeholder="Ej: 11 2345 6789"
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="kyc-location" className="text-sm font-medium">
                Ciudad / zona
              </label>
              <Input
                id="kyc-location"
                value={location}
                maxLength={80}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="kyc-dni-address" className="text-sm font-medium">
                Dirección que figura en tu DNI
              </label>
              <Input
                id="kyc-dni-address"
                value={dniAddress}
                maxLength={240}
                placeholder="Calle, número, ciudad, provincia, código postal"
                onChange={(event) => setDniAddress(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tiene que coincidir con tu dirección de entrega:{" "}
                {deliveryAddress ? (
                  <strong>
                    {deliveryAddress}, {deliveryCity}, {deliveryProvince},{" "}
                    {deliveryPostalCode}
                  </strong>
                ) : (
                  "todavía no cargaste una dirección de entrega en tu perfil."
                )}
              </p>
              {dniAddress.trim().length >= 10 && !dataComplete && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  La dirección del DNI no coincide todavía con la de entrega.
                  Revisá calle, número, ciudad, provincia y código postal.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void saveData()}
              disabled={!dataComplete || dataBusy}
            >
              {dataBusy ? "Guardando…" : "Guardar datos"}
            </Button>
            {!dataComplete && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Completá nombre, DNI, teléfono, ubicación, dirección de entrega
                y dirección del DNI para continuar.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 1. Frente del DNI */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span>1. Frente del DNI</span>
              {dniFrontPreview && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              id="kyc-dni-front"
              onChange={(event) =>
                selectFile(
                  event,
                  "Frente del DNI",
                  setDniFrontFile,
                )
              }
            />
            {dniFrontPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dniFrontPreview}
                alt="Frente del DNI"
                className="aspect-[16/10] w-full rounded-lg border object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm text-muted-foreground">
                Sin imagen
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={submitting}
              onClick={() =>
                document.getElementById("kyc-dni-front")?.click()
              }
            >
              <UploadCloud className="mr-1.5 h-4 w-4" />
              {dniFrontPreview ? "Cambiar frente" : "Subir frente"}
            </Button>
          </CardContent>
        </Card>

        {/* 2. Dorso del DNI */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span>2. Dorso del DNI</span>
              {dniBackPreview && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              id="kyc-dni-back"
              onChange={(event) =>
                selectFile(event, "Dorso del DNI", setDniBackFile)
              }
            />
            {dniBackPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dniBackPreview}
                alt="Dorso del DNI"
                className="aspect-[16/10] w-full rounded-lg border object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm text-muted-foreground">
                Sin imagen
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={submitting}
              onClick={() => document.getElementById("kyc-dni-back")?.click()}
            >
              <UploadCloud className="mr-1.5 h-4 w-4" />
              {dniBackPreview ? "Cambiar dorso" : "Subir dorso"}
            </Button>
          </CardContent>
        </Card>

        {/* 3. Selfie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span>3. Selfie en vivo</span>
              {selfiePreview && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cameraState === "on" ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-[16/10] w-full rounded-lg border bg-black object-cover"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={captureSelfie}>
                    Capturar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={stopCamera}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <>
                {selfiePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selfiePreview}
                    alt="Selfie"
                    className="aspect-[16/10] w-full rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm text-muted-foreground">
                    {cameraState === "starting" ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Conectando cámara…
                      </span>
                    ) : (
                      "Sin imagen"
                    )}
                  </div>
                )}
                <input
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  id="kyc-selfie-file"
                  onChange={(event) =>
                    selectFile(event, "Selfie", setSelfieFile)
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submitting || cameraState === "starting"}
                    onClick={() => void startCamera()}
                  >
                    {cameraState === "starting" ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="mr-1.5 h-4 w-4" />
                    )}
                    {selfiePreview ? "Volver a capturar" : "Abrir cámara"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={submitting}
                    onClick={() =>
                      document.getElementById("kyc-selfie-file")?.click()
                    }
                  >
                    <ImagePlus className="mr-1.5 h-4 w-4" />
                    Subir foto
                  </Button>
                </div>
              </>
            )}
            {cameraError && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {cameraError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Frente: {dniFrontFile ? "listo ✓" : "falta"}
            </span>
            <span>Dorso: {dniBackFile ? "listo ✓" : "falta"}</span>
            <span>Selfie: {selfieFile ? "listo ✓" : "falta"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={
                submitting ||
                !docsReady ||
                !dataComplete ||
                status === "approved"
              }
            >
              {submitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-1.5 h-4 w-4" />
              )}
              {submitting ? "Enviando…" : "Enviar solicitud de verificación"}
            </Button>
            {!docsReady && (
              <p className="text-xs text-muted-foreground">
                Las tres imágenes son obligatorias para enviar.
              </p>
            )}
            {status === "approved" && (
              <p className="text-xs text-muted-foreground">
                Tu identidad ya está verificada.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-300">
          {success}
        </p>
      )}
    </div>
  );
}
