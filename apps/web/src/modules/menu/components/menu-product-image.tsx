"use client";
import Image from "next/image";
import { useState } from "react";
import styles from "./menu-product-image.module.css";
import { safeMenuImage } from "../menu-image";

export function MenuProductImage({
  name,
  imageReference,
  className = "",
  placeholderLabel = "Imagen no disponible",
}: {
  name: string;
  imageReference?: string | null;
  className?: string;
  placeholderLabel?: string;
}) {
  const src = safeMenuImage(imageReference);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return src && src !== failedSource ? (
    <Image
      className={`${styles.image} ${className}`}
      src={src}
      alt={name}
      width={480}
      height={270}
      unoptimized
      onError={() => setFailedSource(src)}
    />
  ) : (
    <div
      className={styles.placeholder}
      role="img"
      aria-label={`Imagen no disponible para ${name}`}
    >
      {placeholderLabel}
    </div>
  );
}
