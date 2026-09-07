(() => {
    const lib = new PlugIn.Library(new Version("0.1.0"));

    const SHAPE_MAP = {
        rect: "Rectangle",
        rectangle: "Rectangle",
        round: "Rectangle",
        stadium: "Rectangle",
        circle: "Circle",
        diamond: "Diamond",
        hexagon: "Hexagon"
    };
    const NODE_W = 120;
    const NODE_H = 48;
    const GAP = 40;
    const PAD = 28;
    const TITLE_H = 26;

    function asArray(value) {
        if (!value) {
            return [];
        }
        if (Object.prototype.toString.call(value) === "[object Array]") {
            return value;
        }
        return [];
    }

    function stripWrappingQuotes(value) {
        let text = String(value == null ? "" : value).trim();
        const pairs = [
            ['"', '"'],
            ["'", "'"],
            ["\u201C", "\u201D"],
            ["\u2018", "\u2019"],
            ["\u300C", "\u300D"],
            ["\u300E", "\u300F"],
            ["\uFF02", "\uFF02"],
            ["\uFF07", "\uFF07"]
        ];
        let changed = true;
        while (changed && text.length >= 2) {
            changed = false;
            for (let i = 0; i < pairs.length; i++) {
                const open = pairs[i][0];
                const close = pairs[i][1];
                if (text.charAt(0) === open && text.charAt(text.length - 1) === close) {
                    text = text.slice(1, -1).trim();
                    changed = true;
                    break;
                }
            }
        }
        return text;
    }

    function toOgText(value) {
        let text = String(value == null ? "" : value)
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/br>/gi, "\n");
        text = stripWrappingQuotes(text);
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            lines[i] = stripWrappingQuotes(lines[i]);
        }
        return lines.join("\n");
    }

    function lineCount(text) {
        const parts = String(text || "").split("\n");
        return Math.max(1, parts.length);
    }

    function longestLine(text) {
        const parts = String(text || "").split("\n");
        let max = 0;
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].length > max) {
                max = parts[i].length;
            }
        }
        return max;
    }

    function mapShape(name) {
        if (!name) {
            return "Rectangle";
        }
        const key = String(name).toLowerCase();
        return SHAPE_MAP[key] || "Rectangle";
    }

    function groupMap(groups) {
        const map = {};
        const list = asArray(groups);
        for (let i = 0; i < list.length; i++) {
            const g = list[i];
            if (g && g.id) {
                map[String(g.id)] = {
                    id: String(g.id),
                    title: toOgText(g.title || g.id),
                    direction: normalizeDir(g.direction),
                    parent: g.parent ? String(g.parent) : "",
                    children: []
                };
            }
        }
        return map;
    }

    function normalizeDir(value) {
        const d = String(value || "TB").toUpperCase();
        if (d === "TD") {
            return "TB";
        }
        if (d === "LR" || d === "RL" || d === "BT" || d === "TB") {
            return d;
        }
        return "TB";
    }

    function isHorizontal(dir) {
        return dir === "LR" || dir === "RL";
    }

    function layoutTree(ir) {
        const nodes = asArray(ir.nodes);
        const groups = groupMap(ir.groups);
        const byId = {};
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i] || {};
            const id = String(n.id || ("n" + i));
            const text = toOgText(n.text || id);
            byId[id] = {
                kind: "node",
                id: id,
                text: text,
                shape: n.shape || "rect",
                parent: n.parent ? String(n.parent) : "",
                w: Math.max(NODE_W, Math.min(280, 24 + longestLine(text) * 9)),
                h: NODE_H + (lineCount(text) - 1) * 20
            };
        }
        const groupIds = [];
        for (const gid in groups) {
            if (groups.hasOwnProperty(gid)) {
                groupIds.push(gid);
                byId[gid] = groups[gid];
                groups[gid].kind = "group";
            }
        }
        for (const id in byId) {
            if (!byId.hasOwnProperty(id)) {
                continue;
            }
            const item = byId[id];
            const pid = item.parent || "";
            if (pid && groups[pid]) {
                groups[pid].children.push(id);
            }
        }

        function ownerAmong(startId, siblingSet) {
            let cur = startId;
            const seen = {};
            while (cur && byId[cur] && !seen[cur]) {
                seen[cur] = true;
                if (siblingSet[cur]) {
                    return cur;
                }
                cur = byId[cur].parent || "";
            }
            return "";
        }

        function sortByFlow(ids) {
            if (!ids || ids.length < 2) {
                return ids || [];
            }
            const siblingSet = {};
            const incoming = {};
            const outgoing = {};
            for (let i = 0; i < ids.length; i++) {
                siblingSet[ids[i]] = true;
                incoming[ids[i]] = 0;
                outgoing[ids[i]] = [];
            }
            const edgeList = asArray(ir.edges);
            for (let e = 0; e < edgeList.length; e++) {
                const a = ownerAmong(String(edgeList[e].from), siblingSet);
                const b = ownerAmong(String(edgeList[e].to), siblingSet);
                if (!a || !b || a === b) {
                    continue;
                }
                outgoing[a].push(b);
                incoming[b] += 1;
            }
            const orderedIds = [];
            const queue = [];
            for (let i = 0; i < ids.length; i++) {
                if (incoming[ids[i]] === 0) {
                    queue.push(ids[i]);
                }
            }
            while (queue.length) {
                const id = queue.shift();
                if (orderedIds.indexOf(id) >= 0) {
                    continue;
                }
                orderedIds.push(id);
                const nexts = outgoing[id] || [];
                for (let n = 0; n < nexts.length; n++) {
                    incoming[nexts[n]] -= 1;
                    if (incoming[nexts[n]] <= 0) {
                        queue.push(nexts[n]);
                    }
                }
            }
            for (let i = 0; i < ids.length; i++) {
                if (orderedIds.indexOf(ids[i]) < 0) {
                    orderedIds.push(ids[i]);
                }
            }
            return orderedIds;
        }

        for (const gid in groups) {
            if (groups.hasOwnProperty(gid)) {
                groups[gid].children = sortByFlow(groups[gid].children);
            }
        }

        const rootDir = normalizeDir(ir.layout);
        const roots = [];
        for (const id in byId) {
            if (!byId.hasOwnProperty(id)) {
                continue;
            }
            if (!byId[id].parent) {
                roots.push(id);
            }
        }
        const ordered = sortByFlow(roots);

        function measure(id) {
            const item = byId[id];
            if (!item) {
                return { w: NODE_W, h: NODE_H };
            }
            if (item.kind !== "group") {
                return { w: item.w, h: item.h };
            }
            const dir = item.direction || "TB";
            let w = 0;
            let h = 0;
            for (let i = 0; i < item.children.length; i++) {
                const size = measure(item.children[i]);
                if (isHorizontal(dir)) {
                    w += size.w;
                    if (i > 0) {
                        w += GAP;
                    }
                    if (size.h > h) {
                        h = size.h;
                    }
                } else {
                    h += size.h;
                    if (i > 0) {
                        h += GAP;
                    }
                    if (size.w > w) {
                        w = size.w;
                    }
                }
            }
            item.w = Math.max(w + PAD * 2, 160);
            item.h = Math.max(h + PAD * 2 + TITLE_H, 90);
            return { w: item.w, h: item.h };
        }

        function place(id, x, y) {
            const item = byId[id];
            if (!item) {
                return;
            }
            item.x = x;
            item.y = y;
            if (item.kind !== "group") {
                return;
            }
            const dir = item.direction || "TB";
            const kids = item.children.slice();
            if (dir === "RL" || dir === "BT") {
                kids.reverse();
            }
            let cx = x + PAD;
            let cy = y + PAD + TITLE_H;
            const innerW = item.w - PAD * 2;
            const innerH = item.h - PAD * 2 - TITLE_H;
            for (let i = 0; i < kids.length; i++) {
                const child = byId[kids[i]];
                if (!child) {
                    continue;
                }
                let px = cx;
                let py = cy;
                if (isHorizontal(dir)) {
                    py = cy + Math.max(0, (innerH - child.h) / 2);
                } else {
                    px = cx + Math.max(0, (innerW - child.w) / 2);
                }
                place(kids[i], px, py);
                if (isHorizontal(dir)) {
                    cx += child.w + GAP;
                } else {
                    cy += child.h + GAP;
                }
            }
        }

        let rootW = 0;
        let rootH = 0;
        for (let r = 0; r < roots.length; r++) {
            const size = measure(roots[r]);
            if (isHorizontal(rootDir)) {
                rootW += size.w;
                if (r > 0) {
                    rootW += GAP * 1.4;
                }
                if (size.h > rootH) {
                    rootH = size.h;
                }
            } else {
                rootH += size.h;
                if (r > 0) {
                    rootH += GAP * 1.4;
                }
                if (size.w > rootW) {
                    rootW = size.w;
                }
            }
        }

        const orderedRoots = ordered.slice();
        if (rootDir === "RL" || rootDir === "BT") {
            orderedRoots.reverse();
        }
        let x = 80;
        let y = 80;
        for (let r = 0; r < orderedRoots.length; r++) {
            const child = byId[orderedRoots[r]];
            if (isHorizontal(rootDir)) {
                place(orderedRoots[r], x, y + Math.max(0, (rootH - child.h) / 2));
                x += child.w + GAP * 1.4;
            } else {
                place(orderedRoots[r], x + Math.max(0, (rootW - child.w) / 2), y);
                y += child.h + GAP * 1.4;
            }
        }
        return { byId: byId, groups: groups, roots: ordered };
    }

    lib.parseIR = function (raw) {
        if (!raw) {
            return null;
        }
        if (typeof raw === "object") {
            return raw;
        }
        let text = String(raw).trim();
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence && fence[1]) {
            text = fence[1].trim();
        }
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
            text = text.slice(start, end + 1);
        }
        return JSON.parse(text);
    };

    lib.renderIR = function (ir) {
        if (!ir || !document || !document.windows || !document.windows[0]) {
            throw new Error("没有打开的 OmniGraffle 文档。");
        }
        const canvas = document.windows[0].selection.canvas;
        const nodes = asArray(ir.nodes);
        const edges = asArray(ir.edges);
        if (nodes.length === 0) {
            throw new Error("绘图数据里没有节点。");
        }

        const laid = layoutTree(ir);
        const created = [];
        const graphics = {};

        for (const id in laid.byId) {
            if (!laid.byId.hasOwnProperty(id)) {
                continue;
            }
            const item = laid.byId[id];
            if (item.kind === "group") {
                continue;
            }
            const shapeName = mapShape(item.shape);
            let graphic = null;
            try {
                graphic = canvas.addShape(shapeName, new Rect(Number(item.x), Number(item.y), Number(item.w), Number(item.h)));
            } catch (e) {
                graphic = canvas.addShape("Rectangle", new Rect(Number(item.x), Number(item.y), Number(item.w), Number(item.h)));
            }
            graphic.text = toOgText(item.text);
            try {
                graphic.textWraps = lineCount(item.text) > 1;
            } catch (wrapErr) {
                // Ignore.
            }
            try {
                graphic.textVerticalPlacement = VerticalTextPlacement.Middle;
            } catch (vAlignErr) {
                // Ignore.
            }
            try {
                graphic.textHorizontalAlignment = HorizontalTextAlignment.Center;
            } catch (hAlignErr) {
                // Ignore.
            }
            try {
                graphic.name = item.id;
            } catch (e2) {
                // Ignore.
            }
            try {
                graphic.setUserData("oxhorseId", item.id);
            } catch (e3) {
                // Ignore.
            }
            if (shapeName === "Rectangle" && (item.shape === "round" || item.shape === "stadium")) {
                try {
                    graphic.cornerRadius = 16;
                } catch (e4) {
                    // Ignore.
                }
            }
            graphics[id] = graphic;
            created.push(graphic);
        }

        const groupIds = [];
        for (const gid in laid.groups) {
            if (laid.groups.hasOwnProperty(gid)) {
                groupIds.push(gid);
            }
        }
        groupIds.sort(function (a, b) {
            const da = laid.groups[a].parent ? 1 : 0;
            const db = laid.groups[b].parent ? 1 : 0;
            if (laid.groups[a].parent === b) {
                return -1;
            }
            if (laid.groups[b].parent === a) {
                return 1;
            }
            return db - da;
        });
        groupIds.sort(function (a, b) {
            function depth(id) {
                let d = 0;
                let cur = laid.groups[id];
                while (cur && cur.parent) {
                    d += 1;
                    cur = laid.groups[cur.parent];
                }
                return d;
            }
            return depth(b) - depth(a);
        });

        for (let g = 0; g < groupIds.length; g++) {
            const gid = groupIds[g];
            const group = laid.groups[gid];
            const kids = [];
            for (let c = 0; c < group.children.length; c++) {
                const childGraphic = graphics[group.children[c]];
                if (childGraphic) {
                    kids.push(childGraphic);
                }
            }
            if (kids.length === 0) {
                continue;
            }
            let wrapped = null;
            try {
                wrapped = new Subgraph(kids);
            } catch (e5) {
                try {
                    wrapped = new Group(kids);
                } catch (e6) {
                    wrapped = null;
                }
            }
            if (!wrapped) {
                continue;
            }
            try {
                wrapped.name = group.title;
            } catch (e7) {
                // Ignore.
            }
            try {
                if (wrapped.background) {
                    wrapped.background.text = toOgText(group.title);
                    try {
                        wrapped.background.geometry = new Rect(
                            Number(group.x),
                            Number(group.y),
                            Number(group.w),
                            Number(group.h)
                        );
                    } catch (bgGeo) {
                        // Ignore: some subgraphs refuse a manual background size.
                    }
                }
            } catch (e8) {
                // Ignore.
            }
            try {
                wrapped.connectToGroupOnly = false;
            } catch (e9) {
                // Ignore.
            }
            try {
                wrapped.setUserData("oxhorseId", gid);
            } catch (e10) {
                // Ignore.
            }
            graphics[gid] = wrapped;
            created.push(wrapped);
        }

        for (let j = 0; j < edges.length; j++) {
            const edge = edges[j] || {};
            const from = graphics[String(edge.from)];
            const to = graphics[String(edge.to)];
            if (!from || !to) {
                continue;
            }
            let line = null;
            try {
                line = canvas.connect(from, to);
            } catch (e11) {
                line = null;
            }
            if (line && edge.label) {
                try {
                    line.name = toOgText(edge.label);
                    try {
                        line.text = toOgText(edge.label);
                    } catch (lineTextErr) {
                        // Ignore.
                    }
                } catch (e12) {
                    // Ignore.
                }
            }
            if (line) {
                try {
                    line.headType = "Arrow";
                } catch (e13) {
                    // Ignore.
                }
                created.push(line);
            }
        }

        const view = document.windows[0].selection.view;
        if (view) {
            try {
                view.select(created, false);
            } catch (e14) {
                // Ignore.
            }
        }
        return created.length;
    };

    lib.renderJSON = function (raw) {
        const ir = lib.parseIR(raw);
        return lib.renderIR(ir);
    };

    return lib;
})();
