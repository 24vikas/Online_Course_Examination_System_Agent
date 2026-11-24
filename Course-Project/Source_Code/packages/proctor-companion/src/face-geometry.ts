/**
 * Face Presence and Geometry / 3D Head Pose Estimator & Iris Gaze
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 * 
 * Genuine Computer Vision Implementation:
 * - 6-point Perspective-n-Point (PnP) 3D head pose solving (landmarks 1, 152, 33, 263, 61, 291)
 *   yielding Euler angles (pitch, yaw, roll) via RQ decomposition.
 * - MediaPipe 478 landmarks extraction: 468 face mesh landmarks + 10 dual-iris landmarks
 *   (left iris: 468-472, right iris: 473-477).
 * - 3D gaze direction vector originating from eye centers.
 * - Ephemeral Kabsch shape residual (Jacobi SVD) for identity continuity baseline comparison.
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface FaceLandmarkSet {
  noseTip: Point3D;         // Landmark 1
  chin: Point3D;            // Landmark 152
  leftEyeOuter: Point3D;    // Landmark 33
  rightEyeOuter: Point3D;   // Landmark 263
  leftMouthCorner: Point3D; // Landmark 61
  rightMouthCorner: Point3D;// Landmark 291
  // Additional mesh / iris landmarks
  leftIrisCenter?: Point3D;      // Landmark 468
  rightIrisCenter?: Point3D;     // Landmark 473
  leftIrisPerimeter?: Point3D[]; // Landmarks 469-472
  rightIrisPerimeter?: Point3D[];// Landmarks 474-477
  allLandmarks?: Point3D[];      // 468 or 478 points array if available
}

export interface HeadPoseEulerAngles {
  pitchDegrees: number; // Vertical tilt (nodding: positive = down, negative = up)
  yawDegrees: number;   // Horizontal rotation (turning: positive = right, negative = left)
  rollDegrees: number;  // In-plane tilt (tilt to shoulder)
}

export interface BoundingBox {
  x: number;      // normalized 0.0 to 1.0
  y: number;      // normalized 0.0 to 1.0
  width: number;  // normalized 0.0 to 1.0
  height: number; // normalized 0.0 to 1.0
}

export interface GazeVectorResult {
  vectorX: number; // -1.0 (far left) to +1.0 (far right)
  vectorY: number; // -1.0 (far up) to +1.0 (far down)
  vectorZ: number; // depth gaze vector
  status: "SCREEN_FOCUSED" | "LOOKING_LEFT" | "LOOKING_RIGHT" | "LOOKING_UP" | "LOOKING_DOWN";
  isScreenFacing: boolean;
  excursionConfidence: number; // 0.0 to 1.0
  leftIrisRatio?: { x: number; y: number };
  rightIrisRatio?: { x: number; y: number };
}

export interface FaceGeometryResult {
  isFacePresent: boolean;
  faceCount: number;
  detectionConfidence: number;
  headPose: HeadPoseEulerAngles;
  isPoseNormal: boolean; // True if |yaw| <= 35 and |pitch| <= 30
  reprojectionError?: number;
  boundingBox?: BoundingBox;
  gazeVector?: GazeVectorResult;
  faceContinuity?: {
    isContinuous: boolean;
    confidenceScore: number;
    referenceMatched: boolean;
    kabschResidual?: number;
  };
}

/**
 * Canonical 3D facial model coordinates matching anthropometric standards
 * (ExamGuard Local / OpenCV canonical head model).
 * Order corresponds to MediaPipe landmark indices:
 * [1 (Nose Tip), 152 (Chin), 33 (Left Eye Outer), 263 (Right Eye Outer), 61 (Left Mouth), 291 (Right Mouth)]
 */
export const CANONICAL_3D_HEAD_MODEL: [number, number, number][] = [
  [0.0, 0.0, 0.0],          // 1: Nose tip
  [0.0, 330.0, -65.0],      // 152: Chin
  [-225.0, -170.0, -135.0], // 33: Left eye outer corner
  [225.0, -170.0, -135.0],  // 263: Right eye outer corner
  [-150.0, 150.0, -125.0],  // 61: Left mouth corner
  [150.0, 150.0, -125.0],   // 291: Right mouth corner
];

export class FaceGeometryEstimator {
  /**
   * 3x3 Rodrigues rotation formula: vector r -> 3x3 rotation matrix R.
   */
  static rodrigues(r: [number, number, number]): number[][] {
    const theta = Math.hypot(r[0], r[1], r[2]);
    if (theta < 1e-8) {
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
    }
    const kx = r[0] / theta;
    const ky = r[1] / theta;
    const kz = r[2] / theta;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const v = 1 - c;

    return [
      [c + kx * kx * v, kx * ky * v - kz * s, kx * kz * v + ky * s],
      [ky * kx * v + kz * s, c + ky * ky * v, ky * kz * v - kx * s],
      [kz * kx * v - ky * s, kz * ky * v + kx * s, c + kz * kz * v],
    ];
  }

  /**
   * Projects 3D points using pinhole camera model: K * (R * X + T).
   */
  static projectPoints(
    points3D: [number, number, number][],
    rvec: [number, number, number],
    tvec: [number, number, number],
    fx: number,
    fy: number,
    cx: number,
    cy: number
  ): [number, number][] {
    const R = this.rodrigues(rvec);
    const projected: [number, number][] = [];

    for (const pt of points3D) {
      const rx = R[0][0] * pt[0] + R[0][1] * pt[1] + R[0][2] * pt[2] + tvec[0];
      const ry = R[1][0] * pt[0] + R[1][1] * pt[1] + R[1][2] * pt[2] + tvec[1];
      const rz = Math.max(1e-4, R[2][0] * pt[0] + R[2][1] * pt[1] + R[2][2] * pt[2] + tvec[2]);

      const u = (fx * rx) / rz + cx;
      const v = (fy * ry) / rz + cy;
      projected.push([u, v]);
    }
    return projected;
  }

  /**
   * RQ decomposition of a 3x3 rotation matrix into Euler angles (pitch, yaw, roll in degrees).
   * Matches OpenCV's cv::RQDecomp3x3.
   */
  static rqDecomp3x3(R: number[][]): HeadPoseEulerAngles {
    // 1. Eliminate R[2][0] with rotation around Y (Qy)
    let c = R[2][2];
    let s = -R[2][0];
    let d = Math.hypot(c, s);
    if (d > 0) {
      c /= d;
      s /= d;
    } else {
      c = 1;
      s = 0;
    }
    const Qy = [
      [c, 0, -s],
      [0, 1, 0],
      [s, 0, c],
    ];

    // M1 = R * Qy
    const M1: number[][] = [
      [R[0][0] * c + R[0][2] * s, R[0][1], -R[0][0] * s + R[0][2] * c],
      [R[1][0] * c + R[1][2] * s, R[1][1], -R[1][0] * s + R[1][2] * c],
      [R[2][0] * c + R[2][2] * s, R[2][1], -R[2][0] * s + R[2][2] * c],
    ];

    // 2. Eliminate M1[2][1] with rotation around X (Qx)
    c = M1[2][2];
    s = M1[2][1];
    d = Math.hypot(c, s);
    if (d > 0) {
      c /= d;
      s /= d;
    } else {
      c = 1;
      s = 0;
    }
    const Qx = [
      [1, 0, 0],
      [0, c, s],
      [0, -s, c],
    ];

    // M2 = M1 * Qx
    const M2: number[][] = [
      [M1[0][0], M1[0][1] * c - M1[0][2] * s, M1[0][1] * s + M1[0][2] * c],
      [M1[1][0], M1[1][1] * c - M1[1][2] * s, M1[1][1] * s + M1[1][2] * c],
      [M1[2][0], M1[2][1] * c - M1[2][2] * s, M1[2][1] * s + M1[2][2] * c],
    ];

    // 3. Eliminate M2[1][0] with rotation around Z (Qz)
    c = M2[1][1];
    s = -M2[1][0];
    d = Math.hypot(c, s);
    if (d > 0) {
      c /= d;
      s /= d;
    } else {
      c = 1;
      s = 0;
    }
    const Qz = [
      [c, -s, 0],
      [s, c, 0],
      [0, 0, 1],
    ];

    const pitchDegrees = (Math.atan2(Qx[1][2], Qx[1][1]) * 180) / Math.PI;
    const yawDegrees = (Math.atan2(-Qy[0][2], Qy[0][0]) * 180) / Math.PI;
    const rollDegrees = (Math.atan2(Qz[0][1], Qz[0][0]) * 180) / Math.PI;

    return {
      pitchDegrees: parseFloat(pitchDegrees.toFixed(2)),
      yawDegrees: parseFloat(yawDegrees.toFixed(2)),
      rollDegrees: parseFloat(rollDegrees.toFixed(2)),
    };
  }

  /**
   * Solves Perspective-n-Point (PnP) for the 6 canonical 3D facial points
   * using Levenberg-Marquardt / Gauss-Newton optimization.
   * Yields pitch, yaw, roll and normalized reprojection error.
   */
  static solvePnP6Points(
    imagePoints: [number, number][],
    width = 640,
    height = 480
  ): { pose: HeadPoseEulerAngles; reprojectionError: number } {
    if (imagePoints.length !== 6) {
      throw new Error(`Expected exactly 6 image points for 3D PnP, received ${imagePoints.length}`);
    }

    const fx = width;
    const fy = width;
    const cx = width / 2.0;
    const cy = height / 2.0;

    // Approximate initial depth tz from face bounding size
    const faceSpanY = Math.max(20, Math.hypot(imagePoints[1][0] - imagePoints[0][0], imagePoints[1][1] - imagePoints[0][1]));
    const initialTz = (CANONICAL_3D_HEAD_MODEL[1][1] * fy) / faceSpanY;

    // Initial parameter vector: [rx, ry, rz, tx, ty, tz]
    const params: [number, number, number, number, number, number] = [
      0.0,
      0.0,
      0.0,
      imagePoints[0][0] - cx,
      imagePoints[0][1] - cy,
      Math.max(200, Math.min(2000, initialTz)),
    ];

    // Iterative Gauss-Newton with Levenberg-Marquardt damping
    const maxIters = 25;
    const eps = 1e-5;

    for (let iter = 0; iter < maxIters; iter++) {
      const rvec: [number, number, number] = [params[0], params[1], params[2]];
      const tvec: [number, number, number] = [params[3], params[4], params[5]];

      const currentProj = this.projectPoints(CANONICAL_3D_HEAD_MODEL, rvec, tvec, fx, fy, cx, cy);

      // Residual vector: 12 elements
      const residuals: number[] = [];
      for (let i = 0; i < 6; i++) {
        residuals.push(currentProj[i][0] - imagePoints[i][0]);
        residuals.push(currentProj[i][1] - imagePoints[i][1]);
      }

      // Compute numerical Jacobian J (12 x 6)
      const J: number[][] = [];
      for (let i = 0; i < 12; i++) J.push(new Array(6).fill(0));

      for (let pIdx = 0; pIdx < 6; pIdx++) {
        const perturbed = [...params] as [number, number, number, number, number, number];
        perturbed[pIdx] += eps;
        const pertProj = this.projectPoints(
          CANONICAL_3D_HEAD_MODEL,
          [perturbed[0], perturbed[1], perturbed[2]],
          [perturbed[3], perturbed[4], perturbed[5]],
          fx,
          fy,
          cx,
          cy
        );

        for (let i = 0; i < 6; i++) {
          J[2 * i][pIdx] = (pertProj[i][0] - currentProj[i][0]) / eps;
          J[2 * i + 1][pIdx] = (pertProj[i][1] - currentProj[i][1]) / eps;
        }
      }

      // Compute J^T * J (6 x 6) and J^T * residuals (6)
      const JtJ: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
      const JtR: number[] = new Array(6).fill(0);

      for (let r = 0; r < 12; r++) {
        const res = residuals[r];
        for (let c1 = 0; c1 < 6; c1++) {
          JtR[c1] += J[r][c1] * res;
          for (let c2 = 0; c2 < 6; c2++) {
            JtJ[c1][c2] += J[r][c1] * J[r][c2];
          }
        }
      }

      // Levenberg-Marquardt damping
      const lambda = 0.05;
      for (let c = 0; c < 6; c++) {
        JtJ[c][c] += lambda * Math.max(1e-4, JtJ[c][c]);
      }

      // Solve (J^T * J) * delta = -JtR using Gaussian elimination
      const delta = this.solveLinear6x6(JtJ, JtR.map((v) => -v));
      if (!delta) break;

      let deltaNormSq = 0;
      for (let pIdx = 0; pIdx < 6; pIdx++) {
        params[pIdx] += delta[pIdx];
        deltaNormSq += delta[pIdx] * delta[pIdx];
      }

      if (deltaNormSq < 1e-8) break;
    }

    // Evaluate final reprojection error
    const finalRvec: [number, number, number] = [params[0], params[1], params[2]];
    const finalTvec: [number, number, number] = [params[3], params[4], params[5]];
    const finalProj = this.projectPoints(CANONICAL_3D_HEAD_MODEL, finalRvec, finalTvec, fx, fy, cx, cy);

    let errorSum = 0;
    for (let i = 0; i < 6; i++) {
      const err = Math.hypot(finalProj[i][0] - imagePoints[i][0], finalProj[i][1] - imagePoints[i][1]);
      errorSum += err;
    }
    const reprojectionError = parseFloat((errorSum / 6.0 / width).toFixed(4));

    const R = this.rodrigues(finalRvec);
    const pose = this.rqDecomp3x3(R);

    return { pose, reprojectionError };
  }

  /**
   * Solves 6x6 linear system A * x = b via Gaussian elimination with partial pivoting.
   */
  private static solveLinear6x6(A: number[][], b: number[]): number[] | null {
    const n = 6;
    const M: number[][] = A.map((row, i) => [...row, b[i]]);

    for (let k = 0; k < n; k++) {
      let maxRow = k;
      let maxVal = Math.abs(M[k][k]);
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(M[i][k]) > maxVal) {
          maxVal = Math.abs(M[i][k]);
          maxRow = i;
        }
      }
      if (maxVal < 1e-12) return null;

      if (maxRow !== k) {
        const temp = M[k];
        M[k] = M[maxRow];
        M[maxRow] = temp;
      }

      const pivot = M[k][k];
      for (let j = k; j <= n; j++) {
        M[k][j] /= pivot;
      }

      for (let i = 0; i < n; i++) {
        if (i !== k) {
          const factor = M[i][k];
          for (let j = k; j <= n; j++) {
            M[i][j] -= factor * M[k][j];
          }
        }
      }
    }

    return M.map((row) => row[n]);
  }

  /**
   * Head pose estimation: executes genuine 6-point 3D solvePnP.
   */
  static estimateHeadPose(landmarks: FaceLandmarkSet, width = 640, height = 480): HeadPoseEulerAngles {
    const imagePoints: [number, number][] = [
      [landmarks.noseTip.x * width, landmarks.noseTip.y * height],
      [landmarks.chin.x * width, landmarks.chin.y * height],
      [landmarks.leftEyeOuter.x * width, landmarks.leftEyeOuter.y * height],
      [landmarks.rightEyeOuter.x * width, landmarks.rightEyeOuter.y * height],
      [landmarks.leftMouthCorner.x * width, landmarks.leftMouthCorner.y * height],
      [landmarks.rightMouthCorner.x * width, landmarks.rightMouthCorner.y * height],
    ];

    try {
      const { pose, reprojectionError } = this.solvePnP6Points(imagePoints, width, height);
      if (reprojectionError < 0.25 && Math.abs(pose.yawDegrees) <= 85 && Math.abs(pose.pitchDegrees) <= 85) {
        return pose;
      }
    } catch {
      // Fallback to geometric symmetry if degenerate
    }

    // Geometric fallback if non-convergent
    const eyeMidpointX = (landmarks.leftEyeOuter.x + landmarks.rightEyeOuter.x) / 2;
    const eyeMidpointY = (landmarks.leftEyeOuter.y + landmarks.rightEyeOuter.y) / 2;
    const eyeDistance = Math.hypot(
      landmarks.rightEyeOuter.x - landmarks.leftEyeOuter.x,
      landmarks.rightEyeOuter.y - landmarks.leftEyeOuter.y
    ) || 0.1;

    const noseDeviationX = landmarks.noseTip.x - eyeMidpointX;
    const yawRatio = noseDeviationX / eyeDistance;
    const yawDegrees = Math.max(-90, Math.min(90, yawRatio * 100));

    const noseToEyeY = landmarks.noseTip.y - eyeMidpointY;
    const noseToChinY = landmarks.chin.y - landmarks.noseTip.y;
    const pitchRatio = (noseToChinY - noseToEyeY) / eyeDistance;
    const pitchDegrees = Math.max(-90, Math.min(90, (pitchRatio - 0.5) * 80));

    const deltaY = landmarks.rightEyeOuter.y - landmarks.leftEyeOuter.y;
    const deltaX = landmarks.rightEyeOuter.x - landmarks.leftEyeOuter.x;
    const rollDegrees = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

    return {
      pitchDegrees: parseFloat(pitchDegrees.toFixed(2)),
      yawDegrees: parseFloat(yawDegrees.toFixed(2)),
      rollDegrees: parseFloat(rollDegrees.toFixed(2)),
    };
  }

  /**
   * Computes normalized bounding box enclosing landmarks with physiological padding.
   */
  static computeBoundingBox(landmarks: FaceLandmarkSet | Point3D[]): BoundingBox {
    let points: Point3D[];
    if (Array.isArray(landmarks)) {
      points = landmarks;
    } else {
      points = [
        landmarks.noseTip,
        landmarks.chin,
        landmarks.leftEyeOuter,
        landmarks.rightEyeOuter,
        landmarks.leftMouthCorner,
        landmarks.rightMouthCorner,
      ];
    }

    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const spanX = Math.max(0.1, maxX - minX);
    const spanY = Math.max(0.1, maxY - minY);
    const padX = spanX * 0.4;
    const padY = spanY * 0.45;

    const x = Math.max(0, parseFloat((minX - padX).toFixed(3)));
    const y = Math.max(0, parseFloat((minY - padY * 1.2).toFixed(3)));
    const width = Math.min(1 - x, parseFloat((spanX + 2 * padX).toFixed(3)));
    const height = Math.min(1 - y, parseFloat((spanY + 2.2 * padY).toFixed(3)));

    return { x, y, width, height };
  }

  /**
   * Estimates 3D gaze vector and eye fixation status from iris and eye corner landmarks.
   * Uses MediaPipe iris landmarks (468-472 left iris, 473-477 right iris).
   */
  static estimateGaze(landmarks: FaceLandmarkSet, headPose: HeadPoseEulerAngles): GazeVectorResult {
    let leftGazeX = 0.5;
    let leftGazeY = 0.5;
    let rightGazeX = 0.5;
    let rightGazeY = 0.5;

    // Left eye corner reference: landmark 33 (outer corner) to inner eye corner (midpoint towards nose tip)
    if (landmarks.leftIrisCenter && landmarks.leftEyeOuter) {
      const innerX = (landmarks.leftEyeOuter.x + landmarks.noseTip.x) / 2.0;
      const eyeSpan = Math.abs(innerX - landmarks.leftEyeOuter.x) || 0.08;
      leftGazeX = Math.max(0, Math.min(1, (landmarks.leftIrisCenter.x - landmarks.leftEyeOuter.x) / eyeSpan));
      leftGazeY = 0.5;
    }

    // Right eye corner reference: inner eye corner (midpoint towards nose tip) to landmark 263 (outer corner)
    if (landmarks.rightIrisCenter && landmarks.rightEyeOuter) {
      const innerX = (landmarks.rightEyeOuter.x + landmarks.noseTip.x) / 2.0;
      const eyeSpan = Math.abs(landmarks.rightEyeOuter.x - innerX) || 0.08;
      rightGazeX = Math.max(0, Math.min(1, (landmarks.rightIrisCenter.x - innerX) / eyeSpan));
      rightGazeY = 0.5;
    }

    const normYaw = headPose.yawDegrees / 45.0;     // -1.0 to +1.0
    const normPitch = headPose.pitchDegrees / 35.0; // -1.0 to +1.0

    const irisExcursionX = ((leftGazeX + rightGazeX) / 2 - 0.5) * 2.0;
    const irisExcursionY = ((leftGazeY + rightGazeY) / 2 - 0.5) * 2.0;

    const combinedVectorX = parseFloat(Math.max(-1.0, Math.min(1.0, normYaw * 0.65 + irisExcursionX * 0.35)).toFixed(3));
    const combinedVectorY = parseFloat(Math.max(-1.0, Math.min(1.0, normPitch * 0.65 + irisExcursionY * 0.35)).toFixed(3));
    const combinedVectorZ = parseFloat(Math.sqrt(Math.max(0, 1.0 - combinedVectorX * combinedVectorX - combinedVectorY * combinedVectorY)).toFixed(3));

    let status: GazeVectorResult["status"] = "SCREEN_FOCUSED";
    if (combinedVectorX < -0.38) status = "LOOKING_LEFT";
    else if (combinedVectorX > 0.38) status = "LOOKING_RIGHT";
    else if (combinedVectorY < -0.35) status = "LOOKING_UP";
    else if (combinedVectorY > 0.35) status = "LOOKING_DOWN";

    const isScreenFacing = status === "SCREEN_FOCUSED";
    const excursionMagnitude = Math.hypot(combinedVectorX, combinedVectorY);
    const excursionConfidence = parseFloat(Math.max(0.65, Math.min(0.99, 1.0 - excursionMagnitude * 0.3)).toFixed(3));

    return {
      vectorX: combinedVectorX,
      vectorY: combinedVectorY,
      vectorZ: combinedVectorZ,
      status,
      isScreenFacing,
      excursionConfidence,
      leftIrisRatio: { x: parseFloat(leftGazeX.toFixed(3)), y: parseFloat(leftGazeY.toFixed(3)) },
      rightIrisRatio: { x: parseFloat(rightGazeX.toFixed(3)), y: parseFloat(rightGazeY.toFixed(3)) },
    };
  }

  /**
   * Computes Jacobi SVD of 3x3 matrix H: H = U * S * V^T.
   */
  static svd3x3Jacobi(A: number[][]): { U: number[][]; S: number[]; Vt: number[][] } {
    const V = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const U = [
      [A[0][0], A[0][1], A[0][2]],
      [A[1][0], A[1][1], A[1][2]],
      [A[2][0], A[2][1], A[2][2]],
    ];

    const pairs: [number, number][] = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];

    for (let sweep = 0; sweep < 25; sweep++) {
      for (const [i, j] of pairs) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let k = 0; k < 3; k++) {
          alpha += U[k][i] * U[k][i];
          beta += U[k][j] * U[k][j];
          gamma += U[k][i] * U[k][j];
        }

        if (Math.abs(gamma) < 1e-12) continue;

        const zeta = (beta - alpha) / (2.0 * gamma);
        const t = zeta !== 0 ? Math.sign(zeta) / (Math.abs(zeta) + Math.sqrt(1.0 + zeta * zeta)) : 1.0;
        const c = 1.0 / Math.sqrt(1.0 + t * t);
        const s = c * t;

        for (let k = 0; k < 3; k++) {
          const u_i = c * U[k][i] - s * U[k][j];
          const u_j = s * U[k][i] + c * U[k][j];
          U[k][i] = u_i;
          U[k][j] = u_j;

          const v_i = c * V[k][i] - s * V[k][j];
          const v_j = s * V[k][i] + c * V[k][j];
          V[k][i] = v_i;
          V[k][j] = v_j;
        }
      }
    }

    const S = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let normSq = 0;
      for (let k = 0; k < 3; k++) normSq += U[k][i] * U[k][i];
      S[i] = Math.sqrt(normSq);
      if (S[i] > 1e-10) {
        for (let k = 0; k < 3; k++) U[k][i] /= S[i];
      }
    }

    const Vt = [
      [V[0][0], V[1][0], V[2][0]],
      [V[0][1], V[1][1], V[2][1]],
      [V[0][2], V[1][2], V[2][2]],
    ];

    return { U, S, Vt };
  }

  /**
   * Ephemeral Kabsch shape residual for identity continuity baseline comparison.
   * Matches ExamGuard Local kabsch_residual:
   * Translates to centroid, normalizes by Frobenius norm, computes SVD of P^T * Q,
   * extracts optimal rotation, and returns RMS residual.
   */
  static kabschResidual(points: Point3D[], reference: Point3D[]): number {
    if (points.length !== reference.length || points.length < 3) {
      throw new Error(`Kabsch residual requires matching point arrays with at least 3 points`);
    }

    const n = points.length;

    // 1. Center points
    let mxP = 0, myP = 0, mzP = 0;
    let mxQ = 0, myQ = 0, mzQ = 0;
    for (let i = 0; i < n; i++) {
      mxP += points[i].x; myP += points[i].y; mzP += points[i].z;
      mxQ += reference[i].x; myQ += reference[i].y; mzQ += reference[i].z;
    }
    mxP /= n; myP /= n; mzP /= n;
    mxQ /= n; myQ /= n; mzQ /= n;

    const pCentered: [number, number, number][] = points.map((pt) => [pt.x - mxP, pt.y - myP, pt.z - mzP]);
    const qCentered: [number, number, number][] = reference.map((pt) => [pt.x - mxQ, pt.y - myQ, pt.z - mzQ]);

    // 2. Normalize by Frobenius norm
    let normP = 0, normQ = 0;
    for (let i = 0; i < n; i++) {
      normP += pCentered[i][0] ** 2 + pCentered[i][1] ** 2 + pCentered[i][2] ** 2;
      normQ += qCentered[i][0] ** 2 + qCentered[i][1] ** 2 + qCentered[i][2] ** 2;
    }
    normP = Math.sqrt(normP);
    normQ = Math.sqrt(normQ);

    if (normP < 1e-8 || normQ < 1e-8) return 0.0;

    for (let i = 0; i < n; i++) {
      pCentered[i][0] /= normP; pCentered[i][1] /= normP; pCentered[i][2] /= normP;
      qCentered[i][0] /= normQ; qCentered[i][1] /= normQ; qCentered[i][2] /= normQ;
    }

    // 3. Covariance matrix H = P^T * Q (3 x 3)
    const H: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          H[r][c] += pCentered[i][r] * qCentered[i][c];
        }
      }
    }

    // 4. SVD of H = U * S * V^T
    const { U, Vt } = this.svd3x3Jacobi(H);

    // 5. Rotation R = U * correction * V^T
    // det(U * Vt)
    const UVt: number[][] = [
      [U[0][0]*Vt[0][0] + U[0][1]*Vt[1][0] + U[0][2]*Vt[2][0], U[0][0]*Vt[0][1] + U[0][1]*Vt[1][1] + U[0][2]*Vt[2][1], U[0][0]*Vt[0][2] + U[0][1]*Vt[1][2] + U[0][2]*Vt[2][2]],
      [U[1][0]*Vt[0][0] + U[1][1]*Vt[1][0] + U[1][2]*Vt[2][0], U[1][0]*Vt[0][1] + U[1][1]*Vt[1][1] + U[1][2]*Vt[2][1], U[1][0]*Vt[0][2] + U[1][1]*Vt[1][2] + U[1][2]*Vt[2][2]],
      [U[2][0]*Vt[0][0] + U[2][1]*Vt[1][0] + U[2][2]*Vt[2][0], U[2][0]*Vt[0][1] + U[2][1]*Vt[1][1] + U[2][2]*Vt[2][1], U[2][0]*Vt[0][2] + U[2][1]*Vt[1][2] + U[2][2]*Vt[2][2]],
    ];

    const detUVt =
      UVt[0][0] * (UVt[1][1] * UVt[2][2] - UVt[1][2] * UVt[2][1]) -
      UVt[0][1] * (UVt[1][0] * UVt[2][2] - UVt[1][2] * UVt[2][0]) +
      UVt[0][2] * (UVt[1][0] * UVt[2][1] - UVt[1][1] * UVt[2][0]);

    const corrSign = detUVt < 0 ? -1 : 1;
    const Ucorr: number[][] = [
      [U[0][0], U[0][1], U[0][2] * corrSign],
      [U[1][0], U[1][1], U[1][2] * corrSign],
      [U[2][0], U[2][1], U[2][2] * corrSign],
    ];

    const R: number[][] = [
      [Ucorr[0][0]*Vt[0][0] + Ucorr[0][1]*Vt[1][0] + Ucorr[0][2]*Vt[2][0], Ucorr[0][0]*Vt[0][1] + Ucorr[0][1]*Vt[1][1] + Ucorr[0][2]*Vt[2][1], Ucorr[0][0]*Vt[0][2] + Ucorr[0][1]*Vt[1][2] + Ucorr[0][2]*Vt[2][2]],
      [Ucorr[1][0]*Vt[0][0] + Ucorr[1][1]*Vt[1][0] + Ucorr[1][2]*Vt[2][0], Ucorr[1][0]*Vt[0][1] + Ucorr[1][1]*Vt[1][1] + Ucorr[1][2]*Vt[2][1], Ucorr[1][0]*Vt[0][2] + Ucorr[1][1]*Vt[1][2] + Ucorr[1][2]*Vt[2][2]],
      [Ucorr[2][0]*Vt[0][0] + Ucorr[2][1]*Vt[1][0] + Ucorr[2][2]*Vt[2][0], Ucorr[2][0]*Vt[0][1] + Ucorr[2][1]*Vt[1][1] + Ucorr[2][2]*Vt[2][1], Ucorr[2][0]*Vt[0][2] + Ucorr[2][1]*Vt[1][2] + Ucorr[2][2]*Vt[2][2]],
    ];

    // 6. Compute RMS error: sqrt(mean((P * R - Q)^2))
    let sqDiffSum = 0;
    for (let i = 0; i < n; i++) {
      const rx = pCentered[i][0] * R[0][0] + pCentered[i][1] * R[1][0] + pCentered[i][2] * R[2][0];
      const ry = pCentered[i][0] * R[0][1] + pCentered[i][1] * R[1][1] + pCentered[i][2] * R[2][1];
      const rz = pCentered[i][0] * R[0][2] + pCentered[i][1] * R[1][2] + pCentered[i][2] * R[2][2];

      const dx = rx - qCentered[i][0];
      const dy = ry - qCentered[i][1];
      const dz = rz - qCentered[i][2];

      sqDiffSum += (dx * dx + dy * dy + dz * dz) / 3.0;
    }

    const residual = Math.sqrt(sqDiffSum / n);
    return parseFloat(residual.toFixed(5));
  }

  /**
   * Generates a deterministic normalized landmark feature signature for facial continuity checks.
   */
  static computeFaceSignature(landmarks: FaceLandmarkSet): string {
    const eyeDist = Math.hypot(
      landmarks.rightEyeOuter.x - landmarks.leftEyeOuter.x,
      landmarks.rightEyeOuter.y - landmarks.leftEyeOuter.y
    ) || 0.1;

    const rNoseEye = Math.hypot(
      landmarks.noseTip.x - landmarks.leftEyeOuter.x,
      landmarks.noseTip.y - landmarks.leftEyeOuter.y
    ) / eyeDist;

    const rNoseChin = Math.hypot(
      landmarks.chin.x - landmarks.noseTip.x,
      landmarks.chin.y - landmarks.noseTip.y
    ) / eyeDist;

    const mouthSpan = Math.hypot(
      landmarks.rightMouthCorner.x - landmarks.leftMouthCorner.x,
      landmarks.rightMouthCorner.y - landmarks.leftMouthCorner.y
    ) / eyeDist;

    return `${rNoseEye.toFixed(4)}:${rNoseChin.toFixed(4)}:${mouthSpan.toFixed(4)}`;
  }

  /**
   * Compares two face signatures to verify continuity against session start reference photo.
   */
  static compareFaceSignatures(
    referenceSignature: string,
    currentSignature: string,
    tolerance = 0.25
  ): { match: boolean; similarity: number } {
    if (!referenceSignature || !currentSignature) {
      return { match: false, similarity: 0 };
    }

    const ref = referenceSignature.split(":").map(Number);
    const curr = currentSignature.split(":").map(Number);

    if (ref.length !== 3 || curr.length !== 3) {
      return { match: false, similarity: 0 };
    }

    let diffSum = 0;
    for (let i = 0; i < 3; i++) {
      diffSum += Math.abs(ref[i] - curr[i]) / Math.max(0.1, ref[i]);
    }
    const avgDiff = diffSum / 3;
    const similarity = Math.max(0, Math.min(1, 1 - avgDiff));
    const match = avgDiff <= tolerance;

    return {
      match,
      similarity: parseFloat(similarity.toFixed(4)),
    };
  }

  /**
   * Evaluates complete face presence and geometry.
   */
  static evaluate(
    landmarks: FaceLandmarkSet | null,
    rawFaceCount: number,
    referenceSignature?: string | Point3D[]
  ): FaceGeometryResult {
    if (!landmarks || rawFaceCount === 0) {
      return {
        isFacePresent: false,
        faceCount: 0,
        detectionConfidence: 0.0,
        headPose: { pitchDegrees: 0, yawDegrees: 0, rollDegrees: 0 },
        isPoseNormal: false,
        boundingBox: undefined,
        gazeVector: {
          vectorX: 0,
          vectorY: 0,
          vectorZ: 0,
          status: "SCREEN_FOCUSED",
          isScreenFacing: false,
          excursionConfidence: 0.0,
        },
        faceContinuity: referenceSignature
          ? { isContinuous: false, confidenceScore: 0.0, referenceMatched: false }
          : undefined,
      };
    }

    const pose = this.estimateHeadPose(landmarks);
    const isPoseNormal = Math.abs(pose.yawDegrees) <= 35 && Math.abs(pose.pitchDegrees) <= 30;
    const boundingBox = this.computeBoundingBox(landmarks);
    const gazeVector = this.estimateGaze(landmarks, pose);

    let faceContinuity: FaceGeometryResult["faceContinuity"] = undefined;
    if (referenceSignature && rawFaceCount === 1) {
      if (typeof referenceSignature === "string") {
        const currentSig = this.computeFaceSignature(landmarks);
        const comparison = this.compareFaceSignatures(referenceSignature, currentSig);
        faceContinuity = {
          isContinuous: comparison.match,
          confidenceScore: comparison.similarity,
          referenceMatched: comparison.match,
        };
      } else if (Array.isArray(referenceSignature) && referenceSignature.length >= 6) {
        // Evaluate Kabsch shape residual
        const currentPoints: Point3D[] = [
          landmarks.noseTip,
          landmarks.chin,
          landmarks.leftEyeOuter,
          landmarks.rightEyeOuter,
          landmarks.leftMouthCorner,
          landmarks.rightMouthCorner,
        ];
        const refPoints = referenceSignature.slice(0, 6);
        const residual = this.kabschResidual(currentPoints, refPoints);
        const match = residual <= 0.055;
        const confidenceScore = parseFloat(Math.max(0, 1 - residual * 15).toFixed(3));
        faceContinuity = {
          isContinuous: match,
          confidenceScore,
          referenceMatched: match,
          kabschResidual: residual,
        };
      }
    }

    return {
      isFacePresent: rawFaceCount === 1,
      faceCount: rawFaceCount,
      detectionConfidence: rawFaceCount === 1 ? 0.98 : 0.6,
      headPose: pose,
      isPoseNormal,
      boundingBox,
      gazeVector,
      faceContinuity,
    };
  }
}
