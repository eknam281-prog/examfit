"use client";
// 핏찹이 이름: 로그인 없이 이 브라우저의 localStorage(`examfit.fitchapName`)에만 저장한다. 다른 기기·브라우저와 동기화되지 않는다.
import { useCallback, useEffect, useState } from "react";

export const NAME_KEY = "examfit.fitchapName";
export const DEFAULT_NAME = "핏찹이";
export const NAME_MAX = 12;
const EVT = "examfit-name-changed";

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

// 앞뒤 공백 제거, 연속 공백은 하나로, 글자 수는 유니코드 글자 단위(한글·이모지 포함)로 센다. 공백만 입력은 저장할 수 없다.
export function validateName(raw: string): NameCheck {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0) return { ok: false, message: "이름을 입력해 주세요(공백만 입력할 수 없어요)." };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(name)) return { ok: false, message: "사용할 수 없는 문자가 들어 있어요." };
  const len = Array.from(name).length;
  if (len > NAME_MAX) return { ok: false, message: `이름은 ${NAME_MAX}자까지 지을 수 있어요(현재 ${len}자).` };
  return { ok: true, name };
}

export function readName(): string {
  try {
    const raw = localStorage.getItem(NAME_KEY);
    if (!raw) return "";
    const v = JSON.parse(raw);
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

// 이름만 쓴다(다른 저장 항목은 건드리지 않는다). 저장한 뒤 다시 읽어 확인하고, 같은 탭의 다른 화면에 바로 알린다.
export function writeName(name: string): boolean {
  try {
    localStorage.setItem(NAME_KEY, JSON.stringify(name));
    if (readName() !== name) return false;
    window.dispatchEvent(new Event(EVT));
    return true;
  } catch {
    return false;
  }
}

export function useFitchapName() {
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setName(readName());
    sync();
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === NAME_KEY || e.key === null) sync(); // 다른 탭에서 바꾼 이름
    };
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const save = useCallback((raw: string): NameCheck | { ok: false; message: string } => {
    const v = validateName(raw);
    if (!v.ok) return v;
    return writeName(v.name) ? v : { ok: false, message: "이름을 저장하지 못했어요(브라우저 저장 공간을 확인해 주세요). 기존 학습 기록은 그대로예요." };
  }, []);
  return { name, display: name || DEFAULT_NAME, ready, save };
}
