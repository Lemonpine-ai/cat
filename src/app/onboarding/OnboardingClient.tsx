"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./OnboardingClient.module.css";

type OnboardingStep = "home" | "cat" | "done";

type CatDraft = {
  name: string;
  breed: string;
};

type OnboardingClientProps = {
  userId: string;
  displayName: string;
};

/**
 * 집 이름 설정 → 고양이 등록 2단계 온보딩 흐름.
 */
export function OnboardingClient({ userId, displayName }: OnboardingClientProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [step, setStep] = useState<OnboardingStep>("home");
  const [homeName, setHomeName] = useState(`${displayName}네 집`);
  const [createdHomeId, setCreatedHomeId] = useState<string | null>(null);
  const [catDrafts, setCatDrafts] = useState<CatDraft[]>([{ name: "", breed: "" }]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function saveHome(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = homeName.trim();
    if (!trimmedName) {
      setErrorMessage("집 이름을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { data: home, error: homeError } = await supabase
        .from("homes")
        .insert({ name: trimmedName, owner_id: userId })
        .select("id")
        .single();

      if (homeError || !home) throw new Error(homeError?.message ?? "홈 생성 실패");

      await supabase
        .from("profiles")
        .update({ home_id: home.id })
        .eq("id", userId);

      setCreatedHomeId(home.id);
      setStep("cat");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "저장에 실패했어요.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCats(event: React.FormEvent) {
    event.preventDefault();
    if (!createdHomeId) return;

    const validCats = catDrafts.filter((c) => c.name.trim());
    if (validCats.length === 0) {
      router.replace("/");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { error: catsError } = await supabase.from("cats").insert(
        validCats.map((c) => ({
          home_id: createdHomeId,
          name: c.name.trim(),
          breed: c.breed.trim() || null,
        })),
      );

      if (catsError) throw new Error(catsError.message);
      router.replace("/");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "저장에 실패했어요.");
    } finally {
      setIsSaving(false);
    }
  }

  function addCatRow() {
    setCatDrafts((prev) => [...prev, { name: "", breed: "" }]);
  }

  function updateCatDraft(index: number, field: keyof CatDraft, value: string) {
    setCatDrafts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  }

  function removeCatRow(index: number) {
    setCatDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.progressRow}>
          <span className={`${styles.progressDot} ${step === "home" || step === "cat" || step === "done" ? styles.progressDotActive : ""}`} />
          <span className={styles.progressLine} />
          <span className={`${styles.progressDot} ${step === "cat" || step === "done" ? styles.progressDotActive : ""}`} />
        </div>

        {step === "home" ? (
          <form onSubmit={(e) => void saveHome(e)} className={styles.card}>
            <div className={styles.iconWrap} aria-hidden>🏠</div>
            <h1 className={styles.title}>우리 집 이름을 정해볼게요</h1>
            <p className={styles.desc}>
              {displayName}님, 환영해요! 먼저 집 이름을 알려주세요.
            </p>

            {errorMessage ? (
              <p className={styles.error} role="alert">{errorMessage}</p>
            ) : null}

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="home-name">집 이름</label>
              <input
                id="home-name"
                className={styles.input}
                type="text"
                maxLength={40}
                placeholder="예: 보리네 집, 우리집 고양이"
                value={homeName}
                onChange={(e) => setHomeName(e.target.value)}
                autoFocus
              />
            </div>

            <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
              {isSaving ? "저장 중…" : "다음 — 고양이 등록 →"}
            </button>
          </form>
        ) : null}

        {step === "cat" ? (
          <form onSubmit={(e) => void saveCats(e)} className={styles.card}>
            <div className={styles.iconWrap} aria-hidden>🐱</div>
            <h1 className={styles.title}>고양이를 소개해 주세요</h1>
            <p className={styles.desc}>
              나중에 언제든지 추가할 수 있어요.
            </p>

            {errorMessage ? (
              <p className={styles.error} role="alert">{errorMessage}</p>
            ) : null}

            <div className={styles.catList}>
              {catDrafts.map((cat, idx) => (
                <div key={idx} className={styles.catRow}>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder={`고양이 이름 ${idx + 1}`}
                    maxLength={30}
                    value={cat.name}
                    onChange={(e) => updateCatDraft(idx, "name", e.target.value)}
                  />
                  <input
                    className={`${styles.input} ${styles.inputBreed}`}
                    type="text"
                    placeholder="품종 (선택)"
                    maxLength={30}
                    value={cat.breed}
                    onChange={(e) => updateCatDraft(idx, "breed", e.target.value)}
                  />
                  {catDrafts.length > 1 ? (
                    <button
                      type="button"
                      className={styles.btnRemove}
                      onClick={() => removeCatRow(idx)}
                      aria-label="고양이 행 삭제"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              className={styles.btnAddCat}
              onClick={addCatRow}
            >
              + 고양이 추가
            </button>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.btnSkip}
                onClick={() => router.replace("/")}
              >
                건너뛰기
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
                {isSaving ? "저장 중…" : "완료 🎉"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
