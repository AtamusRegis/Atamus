// Atamus sun + lens flare: a WebGL fragment-shader layer composited over the
// 2D game canvas. game.js calls SunFX.render(sx, sy, radiusPx, t) each frame
// with the sun's screen position (CSS px) and disc radius (CSS px).
(() => {
  "use strict";
  const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
  const FRAG = `
precision highp float;
uniform vec2  u_res;    // device px
uniform vec2  u_sun;    // device px, origin bottom-left
uniform float u_t;
uniform float u_dim;   // 1 = full, lower when zoomed out

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.1+vec2(13.0,7.0); a*=0.5; } return v; }
// soft radial glow: linear alpha falloff to r (matches a canvas radial gradient)
vec3 glow(float dist, float r, vec3 col, float a){ float f = max(0.0, 1.0 - dist / r); return col * a * (f * f * (3.0 - 2.0 * f)); } // smooth edge, no visible terminator

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 d = frag - u_sun;
  float dist = length(d);
  float base = min(u_res.x, u_res.y) / 800.0;
  vec3 col = vec3(0.0);

  // a hot blue-white star: wide wash -> saturated bloom -> inner corona -> core
  col += glow(dist, max(u_res.x, u_res.y) * 0.7, vec3(0.27, 0.51, 1.0), 0.24);
  col += glow(dist, 240.0 * base, vec3(0.16, 0.41, 1.0), 0.80);
  // inner corona with a faint, slow shimmer so it reads as live plasma, not a flat blob
  float shimmer = 0.88 + 0.12 * fbm(vec2(atan(d.y, d.x) * 3.0 + u_t * 0.05, dist / (40.0 * base) - u_t * 0.1));
  col += glow(dist, 90.0 * base, vec3(0.35, 0.59, 1.0), 0.80) * shimmer;
  col += glow(dist, 46.0 * base, vec3(0.80, 0.88, 1.0), 0.95);

  // anamorphic streak through the star (hairline, long)
  float sy = d.y / 0.055;
  float sd = length(vec2(d.x, sy));
  col += glow(sd, u_res.x * 0.5, vec3(0.43, 0.67, 1.0), 0.13);

  col *= u_dim;
  col += (hash(frag + u_t) - 0.5) / 255.0;   // dither: kills banding in the big wash
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`;

  let gl = null, prog = null, cv = null, uRes, uSun, uT, uDim, ready = false;

  function init() {
    cv = document.createElement("canvas");
    cv.id = "sunfx";
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;";
    const view = document.getElementById("view");
    view.insertAdjacentElement("beforebegin", cv);   // below the game canvas: objects + UI draw over the sun
    gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG); if (!vs || !fs) return;
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    uRes = gl.getUniformLocation(prog, "u_res"); uSun = gl.getUniformLocation(prog, "u_sun");
    uT = gl.getUniformLocation(prog, "u_t"); uDim = gl.getUniformLocation(prog, "u_dim");
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); // screen blend
    gl.clearColor(0, 0, 0, 0);
    resize(); addEventListener("resize", resize);
    ready = true;
  }
  function resize() {
    if (!gl) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
  }
  // sx, sy: CSS px (top-left origin); t: seconds
  function render(sx, sy, dim, t) {
    if (!ready) return;
    const dpr = window.devicePixelRatio || 1;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uRes, cv.width, cv.height);
    gl.uniform2f(uSun, sx * dpr, cv.height - sy * dpr);
    gl.uniform1f(uT, t); gl.uniform1f(uDim, dim == null ? 1 : dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function clear() { if (ready) gl.clear(gl.COLOR_BUFFER_BIT); }
  window.SunFX = { init, render, clear };
})();
