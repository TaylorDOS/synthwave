uniform float time;
uniform float frequencyData;
uniform float randomOffset;
uniform vec3 baseColor;
varying vec2 vUv;

// Simple pseudo-random function
float rand(float n) {
    return fract(sin(n * 91.345) * 43758.5453);
}

void main() {
    float radius = length(vUv);
    if (radius > 1.0) discard;
    float scanlineEffect = sin(vUv.y * 15.0 + time) * 0.5 + 0.5;
    float noise = rand(floor(vUv.y * 30.0 + randomOffset));
    if (noise > 0.6) scanlineEffect *= 0.0;
    float intensity = smoothstep(0.2, 0.8, scanlineEffect + frequencyData * 0.5);
    vec3 dynamicColor = baseColor * 1.5;
    gl_FragColor = vec4(dynamicColor * intensity, 1.0);
}