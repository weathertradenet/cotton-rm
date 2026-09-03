(() => {
  const YEARS = Array.from({ length: 16 }, (_, i) => 2010 + i);
  const METRICS = {
    yield_t_ha: { label: 'Yield', unit: 't/ha', colors: ['#e5eff8','#c8ddf1','#6e9fd1','#285b94'] },
    planted_area_ha: { label: 'Planted area', unit: 'ha', colors: ['#f5e0e4','#e8cbd0','#d09ea7','#9f6570'] }
  };
  const API = '/api';
  const apiJson = async route => { const r = await fetch(`${API}${route}`); if (!r.ok) throw new Error(`${route}: ${r.status}`); return r.json(); };
  const map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 10 }).setView([25, 10], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/positron' }).addTo(map);

  let selectedYear = 2025, metric = 'yield_t_ha', selectedId = null, boundaryLayer = null;
  let currentRecords = {}, currentFeatures = [], scaleBreaks = [0,0,0], playbackTimer = null, playing = false;
  const yearCache = new Map(), profileCache = new Map();
  let context = { seasons: [], issues: [] };

  const fmt = v => Number.isFinite(v) ? new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v) : '—';
  const recordFor = id => currentRecords[String(id)] || null;
  const valueFor = id => recordFor(id)?.[metric] ?? null;
  const availableRecordValues = () => Object.keys(currentRecords).map(valueFor).filter(v => Number.isFinite(v) && v !== 0).sort((a,b)=>a-b);
  function thresholds() { const v=availableRecordValues(); return v.length ? [.25,.5,.75].map(p=>v[Math.floor((v.length-1)*p)]) : [0,0,0]; }
  function fillColor(v) { if (!Number.isFinite(v)||v===0) return '#f7f9ff'; const [a,b,c]=scaleBreaks, cs=METRICS[metric].colors; return v<=a?cs[0]:v<=b?cs[1]:v<=c?cs[2]:cs[3]; }
  function style(feature) { const id=String(feature.id); const v=valueFor(id), active=id===selectedId; return {fillColor:fillColor(v),fillOpacity:Number.isFinite(v)&&v!==0?.9:0,color:active?'#17291e':'#aaa69c',weight:active?2.2:.4}; }
  function geographyLabel(r) { return ({county:'County',district:'District',municipality:'Municipality',department:'Department',province:'Province',region:'Region',state:'State'}[r?.geography_type]||'Area'); }

  async function loadContext() { try { context = await apiJson('/cotton/context'); } catch(e) { console.warn(e); } }
  async function loadYear(year, fit=false) {
    selectedYear = year; showLoading(); updatePlaybackUI();
    let payload = yearCache.get(year);
    if (!payload) { payload = await apiJson(`/map?year=${year}`); yearCache.set(year,payload); }
    currentRecords = payload.records || {}; currentFeatures = payload.boundaries?.features || []; scaleBreaks=thresholds();
    if (boundaryLayer) boundaryLayer.remove();
    boundaryLayer = L.geoJSON({type:'FeatureCollection',features:currentFeatures},{style,onEachFeature:(f,l)=>l.on({click:()=>selectArea(f,l),mouseover:e=>e.target.setStyle({weight:1.4,color:'#273d2e'}),mouseout:e=>{if(String(f.id)!==selectedId) boundaryLayer.resetStyle(e.target)}})}).addTo(map);
    if (fit && currentFeatures.length) map.fitBounds(boundaryLayer.getBounds(),{padding:[20,20],maxZoom:5});
    if (selectedId && !recordFor(selectedId)) selectedId=null;
    if (!selectedId) selectLargest(); else renderDetails();
    renderLegend();
  }
  function selectLargest() {
    const winner = Object.entries(currentRecords).filter(([,r])=>Number.isFinite(r.planted_area_ha)).sort((a,b)=>b[1].planted_area_ha-a[1].planted_area_ha)[0];
    if (!winner) return renderEmpty();
    selectedId=winner[0];
    boundaryLayer?.setStyle(style); renderDetails();
  }
  function selectArea(feature, layer) { selectedId=String(feature.id); boundaryLayer.setStyle(style); layer.bringToFront(); renderDetails(); document.getElementById('mapNote')?.classList.add('dismissed'); }
  function showLoading(){ document.getElementById('details').innerHTML='<div class="empty-state"><span class="cotton-mark">●</span><h2>Loading cotton data</h2><p>Production records come securely from Notion; boundaries are fetched live from open public sources.</p></div>'; }
  function renderEmpty(){ document.getElementById('details').innerHTML='<div class="empty-state"><h2>No mapped cotton areas</h2><p>No production records with a uniquely matched live administrative boundary were found for this year.</p></div>'; }
  function metricCard(key,r){ const m=METRICS[key]; return `<div class="metric"><div class="metric-label">${m.label}</div><div class="metric-value">${fmt(r?.[key])}<span class="metric-unit">${m.unit}</span></div></div>`; }
  function renderDetails(){
    const r=recordFor(selectedId); if(!r)return renderEmpty();
    const el=document.getElementById('details');
    el.innerHTML=`<div class="county-toolbar"><p class="county-kicker">${geographyLabel(r)} profile</p><button class="county-expand" id="expandCounty" aria-label="Open full profile"><span class="expand-icon"></span></button></div><h2 class="county-title">${r.county}</h2><p class="state-name">${[r.state,r.country].filter(Boolean).join(' · ')}</p><div class="metric-year-row"><span>Data year</span><select id="yearSelect" class="year-select">${YEARS.slice().reverse().map(y=>`<option ${y===selectedYear?'selected':''}>${y}</option>`).join('')}</select></div><div class="metrics">${metricCard('yield_t_ha',r)}${metricCard('planted_area_ha',r)}</div><p class="data-origin-note">Cotton values are served from the private Notion database through Cloudflare. No cotton dataset is stored in this GitHub repository.</p>`;
    document.getElementById('yearSelect').onchange=e=>loadYear(Number(e.target.value));
    document.getElementById('expandCounty').onclick=()=>openProfile(r);
  }
  async function openProfile(r){
    const modal=document.getElementById('countyModal'), card=document.getElementById('countyModalCard'); modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); card.innerHTML='<div class="empty-state"><h2>Loading profile…</h2></div>';
    try {
      let rows=profileCache.get(r.geography_id); if(!rows){rows=await apiJson(`/cotton/profile?id=${encodeURIComponent(r.geography_id)}`);profileCache.set(r.geography_id,rows);}
      const season=context.seasons.find(x=>x.state===r.state||x.country===r.country); const issue=context.issues.find(x=>x.county===r.county&&x.state===r.state&&x.year===selectedYear);
      card.innerHTML=`<div class="modal-topbar"><div class="modal-place"><p class="county-kicker">${geographyLabel(r)} profile</p><h2 id="modalCountyTitle">${r.county}</h2><p class="state-name">${[r.state,r.country].filter(Boolean).join(' · ')}</p></div><button class="modal-close" id="modalClose">×</button></div><section class="modal-data-grid"><div class="modal-series"><p class="county-kicker">Annual cotton production series</p>${seriesTable(rows)}</div><div class="modal-stats"><p class="county-kicker">Cotton-specific information</p><div class="weather-facts">${season?`<div class="weather-fact"><strong>Growing season</strong><span>${season.growing_season_start||'—'} – ${season.growing_season_end||'—'}</span></div>`:''}${issue?`<div class="weather-fact"><strong>Cotton issue · ${selectedYear}</strong><span>${issue.cotton_issue}${issue.source?` — ${issue.source}`:''}</span></div>`:''}</div></div></section><section class="modal-risk-section"><p class="county-kicker">Live climate services</p><div id="liveClimate"><p>Loading current location-based climate risk…</p></div></section>`;
      document.getElementById('modalClose').onclick=closeModal;
      const layer=[...(boundaryLayer?Object.values(boundaryLayer._layers):[])].find(l=>String(l.feature?.id)===r.geography_id); const center=layer?.getBounds().getCenter(); if(center) loadHazards(center.lat,center.lng);
    } catch(e){ card.innerHTML=`<button class="modal-close" id="modalClose">×</button><div class="no-data">Profile could not be loaded.</div>`; document.getElementById('modalClose').onclick=closeModal; }
  }
  function seriesTable(rows){ return `<div class="climate-scroll"><table class="climate-heatmap"><thead><tr><th>Year</th><th>Yield (t/ha)</th><th>Planted area (ha)</th></tr></thead><tbody>${rows.map(x=>`<tr><th>${x.year}</th><td>${fmt(x.yield_t_ha)}</td><td>${fmt(x.planted_area_ha)}</td></tr>`).join('')}</tbody></table></div>`; }
  async function loadHazards(lat,lon){ const el=document.getElementById('liveClimate'); if(!el)return; try{const p=await apiJson(`/hazards?lat=${lat}&lon=${lon}`); const vals=Object.entries(p||{}).slice(0,12); el.innerHTML=vals.length?`<div class="weather-facts">${vals.map(([k,v])=>`<div class="weather-fact"><strong>${k}</strong><span>${typeof v==='object'?'Available':String(v)}</span></div>`).join('')}</div>`:'<p>Climate-risk service returned no displayable values.</p>';}catch(e){el.innerHTML='<p>Climate-risk service is temporarily unavailable or not configured.</p>';}}
  function closeModal(){ const m=document.getElementById('countyModal');m.classList.remove('open');m.setAttribute('aria-hidden','true'); }
  document.getElementById('countyModal').addEventListener('click',e=>{if(e.target.id==='countyModal')closeModal()});

  function renderLegend(){ const m=METRICS[metric], [a,b,c]=scaleBreaks; document.getElementById('legend').innerHTML=`<div class="legend-title">${m.label} · ${selectedYear}</div><div class="legend-row"><i style="background:${m.colors[0]}"></i>≤ ${fmt(a)}</div><div class="legend-row"><i style="background:${m.colors[1]}"></i>${fmt(a)}–${fmt(b)}</div><div class="legend-row"><i style="background:${m.colors[2]}"></i>${fmt(b)}–${fmt(c)}</div><div class="legend-row"><i style="background:${m.colors[3]}"></i>&gt; ${fmt(c)} ${m.unit}</div>`; }
  document.querySelectorAll('.layer-tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.layer-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');metric=b.dataset.metric;scaleBreaks=thresholds();boundaryLayer?.setStyle(style);renderLegend();}));

  function updatePlaybackUI(){ const y=document.getElementById('mapYearDisplay'),s=document.getElementById('mapYearSlider'),i=document.getElementById('mapPlayIcon'),l=document.getElementById('mapPlayLabel'); if(y)y.textContent=selectedYear;if(s)s.value=selectedYear;if(i)i.textContent=playing?'❚❚':'▶';if(l)l.textContent=playing?'Pause':'Play'; }
  function stop(){playing=false;clearInterval(playbackTimer);playbackTimer=null;updatePlaybackUI();}
  function start(){stop();playing=true;updatePlaybackUI();playbackTimer=setInterval(async()=>{const idx=YEARS.indexOf(selectedYear);try{await loadYear(YEARS[(idx+1)%YEARS.length]);}catch(e){console.error(e)}},3000);}
  document.getElementById('mapPlayToggle').onclick=()=>playing?stop():start(); document.getElementById('mapYearSlider').oninput=e=>{stop();loadYear(Number(e.target.value)).catch(console.error)};

  Promise.all([loadContext(),loadYear(2025,true)]).catch(e=>{console.error(e);document.getElementById('details').innerHTML='<div class="no-data">The app could not load. Check the Cloudflare Notion secrets and database property mappings.</div>';});
})();
