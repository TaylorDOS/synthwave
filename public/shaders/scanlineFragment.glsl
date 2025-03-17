uniform float time;
uniform float frequencyData;
uniform float randomOffset;
uniform vec3 baseColor; // Color that changes with music
varying vec2 vUv;

// Simple pseudo-random function
float rand(float n) {
    return fract(sin(n * 91.345) * 43758.5453);
}

void main() {
    float radius = length(vUv);
    if (radius > 1.0) discard; // Keep within the circular shape

    // Define a gradient based on vUv.y
    vec3 colorTop = vec3(0.99, 0.39, 0.7); // Orange at the top
    vec3 colorBottom = vec3(0.6, 0.0, 1.0); // Blue at the bottom

    // Gradient blend from bottom to top
    vec3 gradientColor = mix(colorBottom, colorTop, vUv.y * 1.2);

    // Normal scanline effect (horizontal lines)
    float scanlineEffect = sin(vUv.y * 15.0 + time) * 0.5 + 0.5;

    // Introduce random gaps per horizontal line
    float noise = rand(floor(vUv.y * 30.0 + randomOffset)); // Ensure randomness per row
    if (noise > 0.6) scanlineEffect *= 0.0; // Randomly remove scanlines per horizontal line

    // Blend gradient with baseColor reacting to frequency
    vec3 dynamicColor = mix(gradientColor, baseColor, frequencyData);

    // Apply final intensity
    float intensity = smoothstep(0.2, 0.8, scanlineEffect + frequencyData * 0.5);
    
    gl_FragColor = vec4(dynamicColor * intensity, 1.0);
}