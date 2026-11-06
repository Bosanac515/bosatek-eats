<script lang="ts">
  import { encode } from 'uqr';
  import { app, setProfile } from '../lib/app.svelte';
  import { decodeProfile, encodeProfile, isEncrypted, MAX_CODE } from '../lib/transfer';
  import type { Profile } from '../storage/profile';

  let pass = $state('');
  let code = $state('');
  let qr = $state<{ size: number; d: string } | null>(null);
  let outMsg = $state('');

  let input = $state('');
  let inPass = $state('');
  let inMsg = $state('');
  let pending = $state<Profile | null>(null);

  async function make() {
    outMsg = '';
    try {
      code = await encodeProfile($state.snapshot(app.profile) as Profile, pass || undefined);
      const m = encode(code, { ecc: 'M', border: 2 });
      let d = '';
      m.data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
      qr = { size: m.size, d };
    } catch (e) {
      outMsg = (e as Error).message;
    }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); outMsg = 'Code copied.'; } catch { outMsg = 'Select the code and copy it manually.'; }
  }

  async function read() {
    inMsg = '';
    pending = null;
    try {
      pending = await decodeProfile(input, inPass || undefined);
    } catch (e) {
      inMsg = (e as Error).message;
    }
  }

  function apply() {
    if (!pending) return;
    setProfile(pending);
    pending = null;
    input = inPass = '';
    inMsg = 'Profile imported.';
  }

  // QR scanning uses the browser's built-in BarcodeDetector where available (Chrome/Android).
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices;
  let video = $state<HTMLVideoElement>();
  let stream: MediaStream | null = null;
  let scanning = $state(false);

  async function scan() {
    inMsg = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      scanning = true;
      await Promise.resolve();
      if (!video) return stop();
      video.srcObject = stream;
      await video.play();
      const detector = new (window as unknown as { BarcodeDetector: new (o: object) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } })
        .BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!scanning || !video) return;
        const found = (await detector.detect(video).catch(() => [])).find((r) => r.rawValue.startsWith('EATS1.'));
        if (found) { input = found.rawValue.slice(0, MAX_CODE); stop(); if (!isEncrypted(input)) void read(); return; }
        setTimeout(tick, 300);
      };
      void tick();
    } catch {
      inMsg = 'Could not open the camera. Paste the code instead.';
      stop();
    }
  }
  function stop() {
    scanning = false;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  $effect(() => stop);
</script>

<div class="stack">
  <div class="stack-sm">
    <h3>Send to another device</h3>
    <p class="small muted">Makes a code with your settings. Add a passphrase to lock it. Nothing is uploaded anywhere.</p>
    <div class="field"><label for="tp">Passphrase <span class="muted small">(optional, 8+ characters)</span></label>
      <input id="tp" type="password" autocomplete="new-password" bind:value={pass} /></div>
    <div><button class="small" onclick={make}>Create code</button></div>
    {#if qr}
      <div class="qr" role="img" aria-label="QR code with your profile">
        <svg viewBox="0 0 {qr.size} {qr.size}" shape-rendering="crispEdges" aria-hidden="true"><path d={qr.d} fill="#000" /></svg>
      </div>
      <label class="sr-only" for="tc">Profile code</label>
      <textarea id="tc" readonly value={code}></textarea>
      <div><button class="small" onclick={copyCode}>Copy code</button></div>
    {/if}
    {#if outMsg}<p class="small" role="status">{outMsg}</p>{/if}
  </div>

  <div class="stack-sm">
    <h3>Get settings from another device</h3>
    <label class="sr-only" for="ti">Paste a profile code</label>
    <textarea id="ti" maxlength={MAX_CODE} placeholder="Paste a code that starts with EATS1." bind:value={input}></textarea>
    {#if isEncrypted(input)}
      <div class="field"><label for="tip">Passphrase for this code</label><input id="tip" type="password" autocomplete="off" bind:value={inPass} /></div>
    {/if}
    <div class="row">
      <button class="small" onclick={read} disabled={!input.trim()}>Read code</button>
      {#if canScan}<button class="small" onclick={scanning ? stop : scan}>{scanning ? 'Stop camera' : 'Scan QR'}</button>{/if}
    </div>
    {#if scanning}<video bind:this={video} playsinline muted aria-label="Camera preview for QR scanning"></video>{/if}
    {#if pending}
      <div class="warn stack-sm" role="status">
        <p>This will replace your current settings with: goal {pending.goal}, plan {pending.plan}, {pending.allergens.length} allergens, {pending.diet.length} diets.</p>
        <div class="row"><button class="small primary" onclick={apply}>Replace my settings</button><button class="small" onclick={() => (pending = null)}>Cancel</button></div>
      </div>
    {/if}
    {#if inMsg}<p class="small" role="alert">{inMsg}</p>{/if}
  </div>
</div>
