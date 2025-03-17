varying vec2 vUv;
void main() {
    vUv = uv * 2.0 - 1.0; // Normalize UV to -1 to 1
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}