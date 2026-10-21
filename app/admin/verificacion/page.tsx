"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { submitDni, submitSelfie } from "@/app/admin/verificacion/actions";

type VerificationStatus = "pending" | "approved" | "rejected";

export default function VerificacionPage() {
  const supabase = createClient();

  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [loading, setLoading] = useState(true);

  const [dniFile, setDniFile] = useState<File | null>(null);
  const [dniPreview, setDniPreview] = useState<string | null>(null);
  const [dniBusy, setDniBusy] = useState(false);
  const dniInputRef = useRef<HTMLInputElement>(null);

  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("id", user.id)
        .single();
      if (active) {
        setStatus(data?.verification_status ?? "pending");
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [supabase]);

  function onDniChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setDniFile(f);
    setDniPreview(f ? URL.createObjectURL(f) : null);
  }

  async function handleDni() {
    if (!dniFile) return;
    setDniBusy(true);
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.append("dni", dniFile);
    const res = await submitDni(fd);
    if (!res.ok) setError(res.error ?? "Error al subir el DNI");
    else {
      setSuccess("DNI enviado. Quedó pendiente de revisión.");
      setStatus("pending");
      setDniFile(null);
    }
    setDniBusy(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
      setError(null);
    } catch {
      setError("No se pudo acceder a la cámara. Permití el acceso e intentá de nuevo.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function captureSelfie() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
      setSelfieFile(file);
      setSelfiePreview(URL.createObjectURL(blob));
      stopCamera();
    }, "image/jpeg", 0.9);
  }

  async function handleSelfie() {
    if (!selfieFile) return;
    setSelfieBusy(true);
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.append("selfie", selfieFile);
    const res = await submitSelfie(fd);
    if (!res.ok) setError(res.error ?? "Error al subir el selfie");
    else {
      setSuccess("Selfie enviado. Quedó pendiente de revisión.");
      setStatus("pending");
      setSelfieFile(null);
    }
    setSelfieBusy(false);
  }

  const banner =
    status === "approved"
      ? {
          icon: CheckCircle2,
          text: "Identidad verificada.",
          cls: "text-emerald-600 dark:text-emerald-400",
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
            cls: "text-amber-600 dark:text-amber-400",
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
          Subí el frente de tu DNI y una selfie para poder publicar sorteos.
        </p>
      </header>

      <div
        className={`flex items-center gap-2 rounded-lg border bg-muted/40 p-4 text-sm font-medium ${banner.cls}`}
      >
        <banner.icon className="h-5 w-5 shrink-0" />
        {banner.text}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* DNI */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Frente del DNI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dniPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dniPreview}
                alt="Frente del DNI"
                className="aspect-[16/10] w-full rounded-lg border object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Sin imagen
              </div>
            )}
            <input
              ref={dniInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onDniChange}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dniInputRef.current?.click()}
              >
                <UploadCloud className="mr-1.5 h-4 w-4" />
                {dniPreview ? "Cambiar" : "Subir foto"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDni}
                disabled={!dniFile || dniBusy}
              >
                {dniBusy ? "Enviando…" : "Enviar DNI"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Selfie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Selfie en vivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cameraOn ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-[16/10] w-full rounded-lg border bg-black object-cover"
                />
                <div className="flex gap-2">
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
                  <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    Sin imagen
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startCamera}
                  >
                    <Camera className="mr-1.5 h-4 w-4" />
                    {selfiePreview ? "Volver a capturar" : "Abrir cámara"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSelfie}
                    disabled={!selfieFile || selfieBusy}
                  >
                    {selfieBusy ? "Enviando…" : "Enviar selfie"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
