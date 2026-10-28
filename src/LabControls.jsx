import React, { useEffect, useRef, useState } from 'react';
import { BIOMES, MODELS } from './simulation.js';

function Range({ name, label, settings, update, min, max, step = 1, unit = '°' }) {
  return <label className="slider-row"><span>{label}<strong>{settings[name]}{unit}</strong></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={settings[name]} onChange={e => update(name, Number(e.target.value))} /></label>;
}
const SPECS = {
  plane: ['紙飛機模型格式', '支援 GLB、內嵌資源的 GLTF、OBJ；單檔上限 20 MB。建議 500～5,000 面。', '模型機頭請朝 +Z、機頂朝 +Y；匯入後會統一轉成場景的 +X 前進方向並縮放。OBJ 不載入外部 MTL／貼圖。', '匯入只替換外觀。飛行仍採選定機型的簡化參數；無法自動辨認任意模型的尾舵、翼尖或空氣動力。'],
  sky: ['全景背景格式', '支援 JPG、PNG，單檔上限 10 MB、最高 4096×2048，建議等距柱狀投影的 2:1 圖片。', '圖片只改變天空背景；不會改變重力、風或地形碰撞。HDR 不在本版本支援範圍內。切換場景會恢復預設背景。'],
  objects: ['地景物件格式', '支援一次選取多個 GLB、內嵌資源的 GLTF、OBJ，每檔上限 20 MB，每次最多 10 個，場景總數最多 30 個。', '匯入時依邊界框縮放、底部貼齊地面，分散在航道兩側。物件為視覺佈景，不計算飛機撞擊。外部 GLTF 資源與 OBJ 材質檔不會載入。'],
};
export default function LabControls({ tab, settings, update, focus, crease, importAsset, assetStatus, busy, customPlane, restorePlane }) {
  const [spec, setSpec] = useState(null), dialog = useRef(null);
  useEffect(() => { if (spec && !dialog.current.open) dialog.current.showModal(); }, [spec]);
  const upload = (kind, e) => { const files = Array.from(e.target.files || []); if (files.length) importAsset(kind, files); e.target.value = ''; };
  return <>
    {tab === 'plane' && <section className="lab-section">
      <h2>機型與機翼調校</h2>
      <div className="option-grid">{Object.entries(MODELS).map(([key, value]) => <button key={key} aria-pressed={settings.model === key && !customPlane} onClick={() => { update('model', key); restorePlane(); }}>{value.label}</button>)}</div>
      {customPlane && <p className="lab-note">自訂外觀：{customPlane}。下列調校只影響簡化飛行參數，無法折動匯入模型。</p>}
      <Range name="elevon" label="尾舵偏角" settings={settings} update={update} min={-20} max={20} />
      <Range name="reflex" label="機翼後緣反曲" settings={settings} update={update} min={-15} max={15} />
      <Range name="dihedral" label="機翼上反角" settings={settings} update={update} min={-10} max={25} />
      <Range name="winglet" label="翼尖小翼" settings={settings} update={update} min={0} max={90} />
      <Range name="cgOffset" label="重心前後微調" settings={settings} update={update} min={-15} max={15} unit="%" />
      <p className="lab-note">綠環為重心 CG，藍環為參考壓心 CP。負值前移、正值後移。</p>
      <Range name="seam" label="接縫貼平度" settings={settings} update={update} min={0} max={100} unit="%" />
      <button className="secondary" onClick={crease}>播放骨刀壓痕動畫</button>
      <Range name="roughness" label="紙張粗糙度" settings={settings} update={update} min={0.1} max={0.95} step={0.01} unit="" />
      <Range name="displayScale" label="顯示尺寸" settings={settings} update={update} min={0.8} max={1.8} step={0.1} unit="×" />
      <p className="lab-note">顯示尺寸不影響飛行結果；粗糙度的阻力效果為教學近似。</p>
      <div className="option-grid">{[['overview', '機身全貌'], ['nose', '機首特寫'], ['tail', '尾舵特寫'], ['front', '正面翼形'], ['wing', '翼尖特寫'], ['cg', '重心特寫']].map(([key, label]) => <button key={key} onClick={() => focus(key)}>{label}</button>)}</div>
    </section>}
    {tab === 'launcher' && <section className="lab-section">
      <h2>發射機構</h2>
      <div className="option-grid">{[['hand', '手拋／關閉發射台'], ['deck', '平坦升降甲板'], ['slingshot', '橡皮筋彈射'], ['rail', '雙軌發射台']].map(([key, label]) => <button key={key} aria-pressed={settings.launcher === key} onClick={() => update('launcher', key)}>{label}</button>)}</div>
      <Range name="initialAltitude" label="初始高度" settings={settings} update={update} min={0} max={30} step={0.05} unit=" m" />
      <div className="height-presets">{[0, 1.35, 5, 15, 30].map(h => <button key={h} onClick={() => update('initialAltitude', h)}>{h}m</button>)}</div>
      {settings.launcher === 'slingshot' && <><Range name="tension" label="橡皮筋張力" settings={settings} update={update} min={30} max={150} step={5} unit="%" /><p className="lab-note">依簡化彈簧能量增加初速，發射時呈現橡皮筋回彈。甲板與雙軌採相同基準投擲力道。</p></>}
      <p className="lab-note">高度以發射面相對地面計算。0m 時發射與著陸使用相同基準；模型保留微小防穿模間距。</p>
    </section>}
    {tab === 'environment' && <section className="lab-section">
      <h2>五種實驗環境</h2><div className="biome-options">{Object.entries(BIOMES).map(([key, value]) => <button key={key} aria-pressed={settings.biome === key} onClick={() => update('biome', key)}><strong>{value.label}</strong><span>{value.objects}</span></button>)}</div>
      <div className="environment-facts"><span>重力 {BIOMES[settings.biome].gravity} m/s²</span><span>空氣密度 {BIOMES[settings.biome].density} kg/m³</span></div>
      <p className="lab-note">每個場景都有五類佈景物件。月球不受風、雨、空氣升阻力影響，飛機沿拋物線彈道移動。</p>
    </section>}
    {tab === 'import' && <section className="lab-section">
      <h2>自訂模型與場景</h2><p className="lab-note">檔案在此瀏覽器中讀取，不會上傳。重新整理後不保留。</p>
      {['plane', 'sky', 'objects'].map(kind => <div className="import-card" key={kind}><strong>{SPECS[kind][0]}</strong><button onClick={() => setSpec(kind)}>查看{kind === 'plane' ? '模型' : kind === 'sky' ? '背景' : '物件'}格式說明</button>
        <label className="file-label">{kind === 'plane' ? '選擇紙飛機模型' : kind === 'sky' ? '選擇全景背景' : '選擇多個地景物件'}<input type="file" disabled={busy} accept={kind === 'sky' ? '.jpg,.jpeg,.png' : '.glb,.gltf,.obj'} multiple={kind === 'objects'} onChange={e => upload(kind, e)} /></label></div>)}
      <div role="status" className={`asset-status ${assetStatus.error ? 'error' : ''}`}>{assetStatus.message || '尚未匯入自訂檔案。'}</div>
      <button className="secondary" disabled={busy} onClick={restorePlane}>恢復內建紙飛機</button>
      <button className="secondary" disabled={busy} onClick={() => importAsset('clear', [])}>清除自訂背景與地景</button>
    </section>}
    <dialog ref={dialog} className="spec-dialog" onClose={() => setSpec(null)} aria-labelledby="spec-heading"><h2 id="spec-heading">{spec && SPECS[spec][0]}</h2>{spec && SPECS[spec].slice(1).map(text => <p key={text}>{text}</p>)}<button autoFocus onClick={() => dialog.current.close()}>我知道了</button></dialog>
  </>;
}
