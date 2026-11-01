import * as THREE from 'three';

/**
 * Merges simple indexed or non-indexed geometries that share the same attribute set.
 * Used to keep procedurally built structures to a handful of draw calls.
 */
export function mergeGeometryParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.getAttribute('position').count;
    indexCount += part.index ? part.index.count : part.getAttribute('position').count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    const normal = part.getAttribute('normal');
    const uv = part.getAttribute('uv');
    positions.set(position.array as Float32Array, vertexOffset * 3);
    if (normal) normals.set(normal.array as Float32Array, vertexOffset * 3);
    if (uv) uvs.set(uv.array as Float32Array, vertexOffset * 2);
    if (part.index) {
      for (let i = 0; i < part.index.count; i++) {
        indices[indexOffset + i] = (part.index.array[i] as number) + vertexOffset;
      }
      indexOffset += part.index.count;
    } else {
      for (let i = 0; i < position.count; i++) {
        indices[indexOffset + i] = i + vertexOffset;
      }
      indexOffset += position.count;
    }
    vertexOffset += position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export function boxPart(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (rx !== 0 || ry !== 0 || rz !== 0) geometry.rotateX(rx);
  if (ry !== 0) geometry.rotateY(ry);
  if (rz !== 0) geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  return geometry;
}

export function cylinderPart(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  if (rx !== 0) geometry.rotateX(rx);
  if (ry !== 0) geometry.rotateY(ry);
  if (rz !== 0) geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  return geometry;
}
