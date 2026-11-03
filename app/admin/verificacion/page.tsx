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
import { Input } from "@/components/ui/input";
import { addressMatches } from "@/lib/address";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  saveKycData,
  submitDni,
  submitSelfie,
} from "@/app/admin/verificacion/actions";

type VerificationStatus = "pending" | "approved" | "rejected";

export default function VerificacionPage() {
  const supabase = createClient();

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
        .select(
          "verification_status, full_name, phone, location, dni_number, dni_address, address_line, city, province, postal_code",
        )
        .eq("id", user.id)
        .single();
      if (active) {
        setStatus(data?.verification_status ?? "pending");
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
    if (!dataComplete) {
      setError(
        "Completá y guardá tus datos personales antes de subir el DNI.",
      );
      return;
    }
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
    if (!dataComplete) {
      setError(
        "Completá y guardá tus datos personales antes del selfie.",
      );
      return;
    }
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

  async function saveData() {
    setDataBusy(true);
    setError(null);
    setSuccess(null);

    const result = await saveKycData({
      full_name: fullName,
      phone,
      location,
      dni_number: dniNumber,
      dni_address: dniAddress,
    });

    setDataBusy(false);

    if (!result.ok) {
      setError(result.error ?? "No se pudieron guardar los datos");
      return;
    }

    setSuccess("Datos personales guardados.");
  }

  const banner =
    status === "approved"
      ? {
          icon: CheckCircle2,
          text: "Identidad verificada.",
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
          Es obligatoria para publicar sorteos. Completá tus datos y subí el
          frente del DNI y una selfie.
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
                disabled={!dniFile || dniBusy || !dataComplete}
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
                    disabled={!selfieFile || selfieBusy || !dataComplete}
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
