window.warRoom = function() {
    return {
        // --- STATE ---
        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', debugStatus: 'Ready',
        refSearch: '', week: 1, round1Reset: '', currentPhase: '', phaseAction: '', phaseCountdown: '', 
        currentRoundText: '', alliances: [], players: [], history: [], cities: [], openAlliances: [], 
        openServers: [], authenticated: false, passInput: '', editTag: '', modifiedTags: [], 
        myAllianceName: '', useServerTime: false, displayClock: '',

        // --- FIXED SEASON ANCHOR: Monday, Jan 5, 2026, 03:00 CET ---
        seasonStart: new Date("2026-01-05T03:00:00+01:00"),

        init() {
            // LOAD SAVED SETTINGS (Ensure these work even on force reload)
            const savedAlliance = localStorage.getItem('war_ref_alliance');
            if (savedAlliance) this.myAllianceName = savedAlliance;
            
            this.useServerTime = localStorage.getItem('war_time_mode') === 'true';
            
            this.fetchData();
            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
        },

        saveSettings() {
            localStorage.setItem('war_ref_alliance', this.myAllianceName);
            localStorage.setItem('war_time_mode', this.useServerTime);
        },

        updateClock() {
            const now = new Date();
            const cetTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const serverDate = new Date(cetTime.getTime() - (3 * 60 * 60 * 1000));
            
            // Always update the display clock (Top right of timer box)
            const activeTime = this.useServerTime ? serverDate : cetTime;
            this.displayClock = activeTime.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit', second:'2-digit'}) + (this.useServerTime ? ' [SRV]' : ' [CET]');

            if (cetTime < this.seasonStart) {
                this.currentRoundText = "PRE-SEASON";
                this.currentPhase = "Awaiting Combat";
                this.phaseAction = "Copper war starts Jan 5th, 03:00 CET";
                
                const diff = this.seasonStart - cetTime;
                const dRem = Math.floor(diff / 86400000);
                const hRem = Math.floor((diff % 86400000) / 3600000);
                const mRem = Math.floor((diff % 3600000) / 60000);
                this.phaseCountdown = `${dRem}d : ${hRem}h : ${mRem}m`;
                this.week = 1;
            } else {
                const diffMs = cetTime - this.seasonStart;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
                const day = cetTime.getDay();
                const hour = cetTime.getHours();
                const min = cetTime.getMinutes();
                const isSecondHalf = (day === 0 || day >= 4);
                const roundNum = ((this.week - 1) * 2) + (isSecondHalf ? 2 : 1);
                this.currentRoundText = `Round ${roundNum}`;

                let milestones = [
                    { d: 1, h: 3, name: 'Grouping Phase', action: 'Brackets forming.' },
                    { d: 2, h: 3, name: 'Declaration Window', action: 'R4+ Declare War!' },
                    { d: 3, h: 3, name: 'Invitation Phase', action: 'Defenders invite allies.' },
                    { d: 3, h: 15, name: 'Preparation', action: 'Missiles / Tesla window.' },
                    { d: 3, h: 15.5, name: 'WAR ACTIVE (R1)', action: 'Warehouses -> Center' },
                    { d: 4, h: 3, name: 'Grouping Phase', action: 'Next round forming.' },
                    { d: 5, h: 3, name: 'Declaration Window', action: 'R4+ Declare War!' },
                    { d: 6, h: 3, name: 'Invitation Phase', action: 'Defenders invite allies.' },
                    { d: 6, h: 15, name: 'Preparation', action: 'Missiles / Tesla window.' },
                    { d: 6, h: 15.5, name: 'WAR ACTIVE (R2)', action: 'Warehouses -> Center' },
                    { d: 0, h: 3, name: 'Rest Phase', action: 'Analyze results.' }
                ];

                let next = milestones.find(m => (day < m.d) || (day === m.d && (hour + min/60) < m.h));
                if (!next) next = milestones[0];
                const current = [...milestones].reverse().find(m => (day > m.d) || (day === m.d && (hour + min/60) >= m.h)) || milestones[milestones.length-1];
                this.currentPhase = current.name;
                this.phaseAction = current.action;

                let target = new Date(cetTime);
                target.setDate(target.getDate() + (next.d - day + (next.d < day || (next.d === day && next.h <= (hour+min/60)) ? 7 : 0)));
                target.setHours(Math.floor(next.h), (next.h % 1) * 60, 0, 0);
                const diff = target - cetTime;
                const dRem = Math.floor(diff / 86400000);
                const hRem = Math.floor((diff % 86400000) / 3600000);
                const mRem = Math.floor((diff % 3600000) / 60000);
                this.phaseCountdown = `${dRem}d : ${hRem}h : ${mRem}m`;
            }
        },

        async fetchData() {
            this.loading = true;
            const cb = `&t=${Date.now()}`;
            const base = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFfdDzrMXgqdjSZrSI4YcbDvFoYlrri87EEhG2I9aecW2xcuuLFcl-sxEVjvY1LTdPkXjKSzlwoNQd/pub?output=csv&gid=';
            const scrub = (d) => d.map(r => { let c = {}; Object.keys(r).forEach(k => c[k.trim().toLowerCase().replace(/\s+/g,'')] = r[k] ? String(r[k]).trim() : ''); return c; });
            const fetchCSV = async (gid) => { try { const r = await fetch(base + gid + cb); const t = await r.text(); return scrub(Papa.parse(t, {header:true, skipEmptyLines:true}).data); } catch (e) { return []; } };
            const [rawA, rawP, rawC, rawH] = await Promise.all([fetchCSV('0'), fetchCSV('1007829300'), fetchCSV('1860064624'), fetchCSV('1091133615')]);
            const mapF = (f) => { if (!f) return 'Unassigned'; const l = f.toLowerCase(); if (l.includes('kage') || l.includes('red')) return 'Kage no Sato'; if (l.includes('koubu') || l.includes('blue')) return 'Koubutai'; return 'Unassigned'; };
            this.alliances = rawA.map(r => ({ faction: mapF(r.faction), server: r.server, tag: r.tag, name: r.alliancename, power: Number(r.totalpower.replace(/\D/g,'')) || 0 })).filter(r => r.tag);
            this.players = rawP.map(r => ({ tag: r.tag, name: r.playername, thp: Number(r.thp.replace(/\D/g,'')) || 0 })).filter(r => r.name);
            this.cities = rawC; this.history = rawH;
            this.loading = false;
        },

        get factionData() {
            return this.alliances.map(a => {
                const snps = this.history.filter(x => x.tag.toLowerCase() === a.tag.toLowerCase()).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                const lastStash = snps[0] ? Number(snps[0].totalcopper.replace(/\D/g,'')) : 0;
                const lastTime = snps[0] ? new Date(snps[0].timestamp) : new Date();
                const rate = this.getPassiveRate(a.tag);
                const hoursPassed = (new Date() - lastTime) / 3600000;
                return { ...a, stash: lastStash + (rate * hoursPassed), rate: rate };
            });
        },

        get groupedForces() {
            const groups = {};
            const allianceRanks = this.alliances.map(a => {
                const pList = this.players.filter(p => (p.tag||'').toLowerCase() === a.tag.toLowerCase());
                const maxTHP = pList.length > 0 ? Math.max(...pList.map(p => p.thp)) : 0;
                const data = this.factionData.find(f => f.tag === a.tag);
                return { ...a, maxTHP, stash: data ? data.stash : 0, rate: data ? data.rate : 0 };
            });
            allianceRanks.forEach(a => { if (!groups[a.server]) groups[a.server] = []; groups[a.server].push(a); });
            Object.keys(groups).forEach(s => groups[s].sort((a,b) => b.maxTHP - a.maxTHP));
            return groups;
        },
        get filteredRefList() { if (!this.refSearch) return []; const q = this.refSearch.toLowerCase(); return this.alliances.filter(a => a.tag.toLowerCase().includes(q)).sort((a,b) => a.tag.localeCompare(b.tag)); },
        isAllyServer(serverGroup) { if (!this.myAllianceName) return true; const myF = this.alliances.find(a => a.name === this.myAllianceName)?.faction; return serverGroup.some(a => a.faction === myF); },
        getPlayersForAlliance(tag) { return this.players.filter(p => (p.tag||'').toLowerCase() === tag.toLowerCase()).sort((a,b) => b.thp - a.thp); },
        getPassiveRate(tag) { const c = this.cities.find(x => (x.tag||'').toLowerCase() === tag.toLowerCase()); return c ? (Number(c.l1||0)*100)+(Number(c.l2||0)*200)+(Number(c.l3||0)*300)+(Number(c.l4||0)*400)+(Number(c.l5||0)*500)+(Number(c.l6||0)*600) : 0; },
        isMatch(t) { if (!this.myAllianceName) return false; const me = this.factionData.find(a => a.name === this.myAllianceName); if (!me || t.faction === me.faction || t.faction === 'Unassigned') return false; const meG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.tag === me.tag))?.id; const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id; return meG === taG; },
        matchesSearch(a) { const q = this.searchQuery.toLowerCase(); return (a.name||'').toLowerCase().includes(q) || (a.tag||'').toLowerCase().includes(q); },
        toggleAlliance(tag) { this.openAlliances = this.openAlliances.includes(tag) ? this.openAlliances.filter(x => x !== tag) : [...this.openAlliances, tag]; },
        isAllianceOpen(tag) { return this.openAlliances.includes(tag); },
        toggleServerCollapse(s) { this.openServers = this.isServerOpen(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        isServerOpen(s) { return this.openServers.includes(s); },
        get knsTotalStash() { return this.factionData.filter(a => a.faction.includes('Kage')).reduce((s, a) => s + a.stash, 0); },
        get kbtTotalStash() { return this.factionData.filter(a => a.faction.includes('Koubu')).reduce((s, a) => s + a.stash, 0); },
        login() { if (this.passInput === 'KING') this.authenticated = true; },
        getCityCount(n) { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? Number(c['l'+n] || 0) : 0; },
        getTotalCities() { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? [1,2,3,4,5,6].reduce((s, i) => s + Number(c['l'+i] || 0), 0) : 0; },
        updateCity(n, d) { let c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); if (!c) { c = { tag: this.editTag.toLowerCase(), l1:0,l2:0,l3:0,l4:0,l5:0,l6:0 }; this.cities.push(c); } if (d > 0 && this.getTotalCities() >= 6) return alert("Max 6 cities!"); c['l'+n] = Math.max(0, Number(c['l'+n] || 0) + d); if (!this.modifiedTags.includes(this.editTag)) this.modifiedTags.push(this.editTag); },
        exportCities() { const csv = Papa.unparse(this.cities); const b = new Blob([csv],{type:'text/csv'}); const u = window.URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'cities.csv'; a.click(); this.modifiedTags = []; },
        copyScoutPrompt() { navigator.clipboard.writeText("Please provide: [Tag], [Alliance], [Stash], [Time]"); alert("Scout Prompt Copied!"); },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; }
    }
}
