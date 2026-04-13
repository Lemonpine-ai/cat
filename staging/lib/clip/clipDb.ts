/**
 * clipDb — IndexedDB 기반 클립 저장소.
 *
 * 폰 로컬에 영상 Blob을 저장하고, 메타데이터를 관리합니다.
 * 7일 후 자동 삭제, 최대 100개 제한.
 *
 * QA 반영: getAll() 대신 cursor 기반 순회로 메모리 절약 (120MB → ~1MB)
 */

import type { ClipRecord, ClipMetadata } from "../../types/clip";
import { MAX_CLIPS } from "../../types/clip";

const DB_NAME = "catvisor_clips";
const DB_VERSION = 1;
const STORE_NAME = "clips";

/** IndexedDB 열기 (없으면 생성) */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("captured_at", "captured_at", { unique: false });
        store.createIndex("expires_at", "expires_at", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 클립 저장 (용량 초과 시 자동 정리 후 재시도) */
export async function saveClip(record: ClipRecord): Promise<void> {
  const db = await openDb();

  async function tryPut(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        const err = tx.error;
        /* 용량 초과 시 자동 정리 후 1회 재시도 */
        if (err?.name === "QuotaExceededError") {
          reject(err);
        } else {
          reject(err);
        }
      };
    });
  }

  try {
    await tryPut();
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn("[clipDb] 용량 초과 → 자동 정리 후 재시도");
      db.close();
      await cleanupClips();
      const db2 = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db2.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => { db2.close(); resolve(); };
        tx.onerror = () => { db2.close(); reject(tx.error); };
      });
    }
    throw err;
  } finally {
    db.close();
  }
}

/** 클립 메타데이터 목록 조회 — cursor 기반 (Blob 미로드, 메모리 절약) */
export async function listClips(): Promise<ClipMetadata[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("captured_at");
    /* 최신순 역방향 cursor */
    const request = index.openCursor(null, "prev");
    const results: ClipMetadata[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const record = cursor.value as ClipRecord;
        /* video_blob, thumbnail_base64 제외하고 메타데이터만 수집 */
        results.push({
          id: record.id,
          home_id: record.home_id,
          device_id: record.device_id,
          event_type: record.event_type,
          captured_at: record.captured_at,
          duration: record.duration,
          file_size: record.file_size,
          thumbnail_path: record.thumbnail_path,
          message: record.message,
          expires_at: record.expires_at,
        });
        cursor.continue();
      } else {
        db.close();
        resolve(results);
      }
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

/** 클립 영상 Blob 조회 (재생용) */
export async function getClipBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      db.close();
      const record = request.result as ClipRecord | undefined;
      resolve(record?.video_blob ?? null);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

/** 클립 삭제 */
export async function deleteClip(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** 만료 클립 삭제 + 100개 초과분 삭제 — cursor 기반 (메모리 절약) */
export async function cleanupClips(): Promise<number> {
  const db = await openDb();
  const now = new Date().toISOString();
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    /* 1단계: 만료 클립 삭제 (expires_at 인덱스 cursor) */
    const expiresIndex = store.index("expires_at");
    const range = IDBKeyRange.upperBound(now);
    const expiresCursor = expiresIndex.openCursor(range);

    expiresCursor.onsuccess = () => {
      const cursor = expiresCursor.result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        /* 2단계: 개수 초과 삭제 (captured_at 오래된 순) */
        const countReq = store.count();
        countReq.onsuccess = () => {
          const total = countReq.result;
          if (total <= MAX_CLIPS) return; /* 초과 아니면 끝 */

          let toDelete = total - MAX_CLIPS;
          const oldestCursor = store.index("captured_at").openCursor();
          oldestCursor.onsuccess = () => {
            const c = oldestCursor.result;
            if (c && toDelete > 0) {
              c.delete();
              deletedCount++;
              toDelete--;
              c.continue();
            }
          };
        };
      }
    };

    tx.oncomplete = () => { db.close(); resolve(deletedCount); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** 저장된 클립 개수 */
export async function getClipCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
