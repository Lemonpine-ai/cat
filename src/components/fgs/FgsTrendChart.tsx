"use client";

import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { FgsDailySummaryRow } from "@/types/fgs";
import styles from "./Fgs.module.css";

type Props = {
  /** 최근 7일 FGS 일일 요약 데이터 */
  data: FgsDailySummaryRow[];
};

/**
 * FGS 7일 트렌드 차트 — 꺾은선 그래프
 * - Y축: FGS 점수 (0~4)
 * - 빨간 점선: 주의 기준선 (2점)
 */
export function FgsTrendChart({ data }: Props) {
  /* 날짜를 '4/11' 형식으로 변환 */
  const chartData = data.map((d) => {
    const [, month, day] = d.date.split("-");
    return {
      date: `${Number(month)}/${Number(day)}`,
      avg: Math.round(d.avg_score * 10) / 10,
      max: d.max_score,
    };
  });

  return (
    <div className={styles.trendCard}>
      <div className={styles.trendTitle}>7일 통증 추이 📈</div>

      {chartData.length === 0 ? (
        <div className={styles.trendEmpty}>
          아직 측정 데이터가 없어요 🐾
        </div>
      ) : (
        <div className={styles.trendWrapper}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--mint-200)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[0, 4]}
                ticks={[0, 1, 2, 3, 4]}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${value}점`,
                  name === "avg" ? "평균" : "최고",
                ]}
              />
              {/* 주의 기준선 (FGS 2) */}
              <ReferenceLine
                y={2}
                stroke="#FF9800"
                strokeDasharray="5 5"
                label={{ value: "주의", fontSize: 10, fill: "#FF9800" }}
              />
              {/* 평균 점수 라인 */}
              <Line
                type="monotone"
                dataKey="avg"
                name="평균"
                stroke="#4FC3F7"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              {/* 최고 점수 라인 */}
              <Line
                type="monotone"
                dataKey="max"
                name="최고"
                stroke="#F44336"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
