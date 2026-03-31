/**
 * 프로젝트 데이터 모델 타입 정의
 */

export type ProjectStatus = "draft" | "labeling" | "training" | "completed";
export type VideoStatus = "uploaded" | "extracting" | "extracted" | "error";
export type LabelStatus = "unlabeled" | "auto" | "reviewed";

export interface DetectionClass {
  id: number;
  name: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  classes: DetectionClass[];
  videoSource: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
}

export interface UploadedVideo {
  id: string;
  projectId: string;
  filename: string;
  filepath: string;
  duration: number;
  frameCount: number;
  uploadedAt: string;
  status: VideoStatus;
}

export interface Frame {
  id: string;
  videoId: string;
  frameNumber: number;
  imagePath: string;
  thumbnailPath: string;
  labelStatus: LabelStatus;
}

export interface BoundingBox {
  classId: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface FrameLabels {
  frameId: string;
  boxes: BoundingBox[];
}

export interface ProjectCreateRequest {
  name: string;
  description: string;
  classes: Omit<DetectionClass, "id">[];
  videoSource: string;
}
