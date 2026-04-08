"use client";

import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DailyChartPoint } from "@/types/diary";
import styles from "./Diary.module.css";

type Props = {
  /** 최근 7일치 일별 데이터 */
  data: DailyChartPoint[];
};

/** 꺾은선 4종 — 색상으로 구분 */
const LINES = [
  { key: "meal" as const, name: "식사", color: "#FF8C42" },
  { key: "water" as const, name: "음수", color: "#4FC3F7" },
  { key: "poop" as const, name: "배변", color: "#A1887F" },
  { key: "activity" as const, name: "활동", color: "#81C784" },
];

/** 평균 계산 헬퍼 — 소수점 1자리 */
function avg(data: DailyChartPoint[], key: keyof Omit<DailyChartPoint, "date">) {
  if (data.length === 0) return 0;
  const sum = data.reduce((s, d) => s + d[key], 0);
  return Math.round((sum / data.length) * 10) / 10;
}

/**
 * 건강 트렌드 차트 — 최근 7일 꺾은선 그래프
 * - 식사(주황), 음수(파랑), 배변(갈색), 활동(초록) 4가지 라인
 * - 아래에 오늘 vs 7일 평균 비교 카드
 */
export function HealthTrendChart({ data }: Props) {
  /* 오늘(마지막 데이터)과 7일 평균 비교 */
  const today = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className={styles.chartSection}>
      <h2 className={styles.sectionTitle}>건강 트렌드 📊</h2>

      {data.length === 0 ? (
        <div className={styles.chartEmpty}>아직 기록이 없어요 🐾</div>
      ) : (
        <>
          {/* 꺾은선 그래프 */}
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--mint-200)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "0.8rem" }} />
                {LINES.map((l) => (
                  <Line
                    key={l.key}
                    type="monotone"
                    dataKey={l.key}
                    name={l.name}
                    stroke={l.color}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 오늘 vs 평균 비교 카드 */}
          {today && (
            <div className={styles.avgGrid}>
              {LINES.map((l) => (
                <div key={l.key} className={styles.avgCard}>
                  <div className={styles.avgLabel} style={{ color: l.color }}>
                    {l.name}
                  </div>
                  <div className={styles.avgToday}>{today[l.key]}회</div>
                  <div className={styles.avgAvg}>
                    평균 {avg(data, l.key)}회
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
