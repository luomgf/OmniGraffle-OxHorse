(() => {
    const lib = new PlugIn.Library(new Version("0.1.0"));

    lib.MODE_RECTANGLE = "rectangle";
    lib.MODE_ORIGINAL = "original";

    const DEFAULT_GAP = 8;
    const MIN_EXTRA = 8;

    lib.splitLines = function (text) {
        if (text === null || text === undefined) {
            return [];
        }
        const normalized = String(text)
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\u2028/g, "\n")
            .replace(/\u2029/g, "\n");
        const parts = normalized.split("\n");
        const lines = [];
        for (let i = 0; i < parts.length; i++) {
            const line = parts[i].replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
            if (line.length > 0) {
                lines.push(line);
            }
        }
        return lines;
    };

    lib.rectX = function (rect) {
        if (typeof rect.x === "number") {
            return rect.x;
        }
        return rect.minX;
    };

    lib.rectY = function (rect) {
        if (typeof rect.y === "number") {
            return rect.y;
        }
        return rect.minY;
    };

    lib.rectW = function (rect) {
        if (typeof rect.width === "number") {
            return rect.width;
        }
        return rect.size.width;
    };

    lib.rectH = function (rect) {
        if (typeof rect.height === "number") {
            return rect.height;
        }
        return rect.size.height;
    };

    lib.isLocked = function (solid) {
        if (solid.locked) {
            return true;
        }
        if (solid.layer && solid.layer.locked) {
            return true;
        }
        return false;
    };

    lib.isSplittableSolid = function (solid) {
        if (!solid || typeof solid.text !== "string") {
            return false;
        }
        if (lib.isLocked(solid)) {
            return false;
        }
        return lib.splitLines(solid.text).length >= 2;
    };

    lib.hasSplittableSolids = function (selection) {
        if (!selection || !selection.solids) {
            return false;
        }
        for (let i = 0; i < selection.solids.length; i++) {
            if (lib.isSplittableSolid(selection.solids[i])) {
                return true;
            }
        }
        return false;
    };

    lib.minBoxHeight = function (solid) {
        const textSize = solid.textSize || 12;
        let pad = 8;
        if (typeof solid.textVerticalPadding === "number" && solid.textVerticalPadding > 0) {
            pad = solid.textVerticalPadding * 2;
        }
        return Math.max(24, textSize * 1.6 + pad + MIN_EXTRA);
    };

    lib.applyFrame = function (graphic, x, y, width, height) {
        graphic.geometry = new Rect(Number(x), Number(y), Number(width), Number(height));
    };

    lib.looksLikeBareText = function (solid) {
        const noStroke = !solid.strokeColor || !solid.strokeThickness;
        const noFill = !solid.fillColor;
        return noStroke && noFill;
    };

    lib.promoteToRectangle = function (graphic) {
        try {
            graphic.shape = "Rectangle";
        } catch (e) {
            // Ignore.
        }
        try {
            if (!graphic.strokeColor || !graphic.strokeThickness) {
                graphic.strokeType = StrokeType.Single;
                graphic.strokeThickness = 1;
                graphic.strokeColor = graphic.textColor || Color.black;
            }
        } catch (e) {
            // Ignore.
        }
        try {
            if (!graphic.fillColor) {
                graphic.fillType = FillType.Solid;
                graphic.fillColor = Color.white;
            }
        } catch (e) {
            // Ignore.
        }
        try {
            graphic.textHorizontalAlignment = HorizontalTextAlignment.Center;
        } catch (e) {
            // Ignore.
        }
    };

    lib.applyOriginalLineText = function (graphic, line, x, y, width, height) {
        graphic.text = line;
        try {
            graphic.name = line;
        } catch (e) {
            // Ignore.
        }
        lib.applyFrame(graphic, x, y, width, height);
        graphic.text = line;
        return height;
    };

    lib.applyRectangleLineText = function (graphic, line, x, y, width, minHeight) {
        lib.promoteToRectangle(graphic);

        try {
            graphic.textWraps = false;
        } catch (e) {
            // Ignore.
        }
        try {
            graphic.textFlow = TextFlow.Overflow;
        } catch (e) {
            // Ignore.
        }
        try {
            graphic.textVerticalPlacement = VerticalTextPlacement.Middle;
        } catch (e) {
            // Ignore.
        }
        try {
            if (!(graphic.textVerticalPadding > 0)) {
                graphic.textVerticalPadding = 4;
            }
            if (!(graphic.textHorizontalPadding > 0)) {
                graphic.textHorizontalPadding = 8;
            }
        } catch (e) {
            // Ignore.
        }

        try {
            graphic.autosizing = TextAutosizing.Clip;
        } catch (e) {
            // Ignore.
        }
        graphic.text = line;
        try {
            graphic.name = line;
        } catch (e) {
            // Ignore.
        }

        let height = minHeight;
        try {
            graphic.autosizing = TextAutosizing.Vertical;
            graphic.text = line;
            height = Math.max(minHeight, lib.rectH(graphic.geometry));
            if (graphic.textGeometry) {
                const textHeight = lib.rectH(graphic.textGeometry);
                const pad = (graphic.textVerticalPadding || 0) * 2;
                height = Math.max(height, textHeight + pad + 4);
            }
        } catch (e) {
            // Keep minHeight.
        }

        try {
            graphic.autosizing = TextAutosizing.Overflow;
        } catch (e) {
            // Ignore.
        }
        lib.applyFrame(graphic, x, y, width, height);
        graphic.text = line;
        try {
            graphic.textWraps = false;
        } catch (e) {
            // Ignore.
        }
        try {
            graphic.textVerticalPlacement = VerticalTextPlacement.Middle;
        } catch (e) {
            // Ignore.
        }
        return height;
    };

    lib.applySplitLineText = function (graphic, line, x, y, width, heightOrMin, mode) {
        if (mode === lib.MODE_ORIGINAL) {
            return lib.applyOriginalLineText(graphic, line, x, y, width, heightOrMin);
        }
        return lib.applyRectangleLineText(graphic, line, x, y, width, heightOrMin);
    };

    lib.copyKeyStyle = function (from, to) {
        const keys = [
            "shape",
            "fillColor",
            "fillType",
            "gradientAngle",
            "gradientColor",
            "blendColor",
            "blendFraction",
            "tripleBlend",
            "strokeColor",
            "strokeThickness",
            "strokeType",
            "strokePattern",
            "strokeCap",
            "strokeJoin",
            "cornerRadius",
            "shadowColor",
            "shadowFuzziness",
            "shadowVector",
            "fontName",
            "textSize",
            "textColor",
            "textHorizontalAlignment",
            "textVerticalPlacement",
            "textHorizontalPadding",
            "textVerticalPadding",
            "textWraps",
            "textFlow",
            "autosizing",
            "magnets",
            "rotation",
            "flippedHorizontally",
            "flippedVertically",
            "plasticCurve",
            "plasticHighlightAngle",
            "allowsConnections",
            "alignsEdgesToGrid",
            "textRotation",
            "textRotationIsRelative"
        ];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            try {
                to[key] = from[key];
            } catch (e) {
                // Some properties are not settable on every graphic type.
            }
        }
    };

    lib.duplicateSolid = function (solid, canvas, x, y) {
        let copy = null;
        try {
            copy = solid.duplicateTo(new Point(x, y));
        } catch (e) {
            copy = null;
        }
        if (!copy && canvas) {
            try {
                const geo = solid.geometry;
                const width = lib.rectW(geo);
                const height = lib.rectH(geo);
                let shapeName = "Rectangle";
                try {
                    if (solid.shape) {
                        shapeName = solid.shape;
                    }
                } catch (e) {
                    shapeName = "Rectangle";
                }
                copy = canvas.addShape(shapeName, new Rect(Number(x), Number(y), Number(width), Number(height)));
                lib.copyKeyStyle(solid, copy);
            } catch (e) {
                copy = null;
            }
        }
        if (copy && solid.layer) {
            try {
                copy.layer = solid.layer;
            } catch (e) {
                // Layer may be locked or not assignable.
            }
        }
        if (copy) {
            try {
                copy.locked = false;
            } catch (e) {
                // Ignore.
            }
        }
        return copy;
    };

    lib.splitSolid = function (solid, canvas, gap, mode) {
        const lines = lib.splitLines(solid.text);
        if (lines.length < 2) {
            return [];
        }

        const splitMode = mode === lib.MODE_ORIGINAL ? lib.MODE_ORIGINAL : lib.MODE_RECTANGLE;
        const geo = solid.geometry;
        const x = lib.rectX(geo);
        const y = lib.rectY(geo);
        const width = lib.rectW(geo);
        const minHeight = lib.minBoxHeight(solid);
        const originalHeight = lib.rectH(geo);
        const lineHeight = splitMode === lib.MODE_ORIGINAL
            ? Math.max(minHeight, originalHeight / lines.length)
            : minHeight;

        const graphics = [solid];
        for (let i = 1; i < lines.length; i++) {
            const copy = lib.duplicateSolid(solid, canvas, x, y);
            if (copy) {
                graphics.push(copy);
            }
        }

        const count = Math.min(graphics.length, lines.length);
        let yCursor = y;
        for (let i = 0; i < count; i++) {
            const graphic = graphics[i];
            if (i > 0) {
                try {
                    graphic.notes = "";
                } catch (e) {
                    // Ignore.
                }
            }

            const height = lib.applySplitLineText(
                graphic,
                lines[i],
                x,
                yCursor,
                width,
                lineHeight,
                splitMode
            );

            if (i > 0) {
                try {
                    graphic.orderBelow(graphics[i - 1]);
                } catch (e) {
                    // Ignore.
                }
            }
            yCursor += height + gap;
        }

        return graphics;
    };

    lib.spacingForCanvas = function (canvas) {
        try {
            if (canvas && typeof canvas.spaceBetweenObjectsInColumn === "number") {
                const spacing = canvas.spaceBetweenObjectsInColumn;
                if (spacing > 0 && spacing < 80) {
                    return spacing;
                }
            }
        } catch (e) {
            // Fall through to default.
        }
        return DEFAULT_GAP;
    };

    lib.openFloatingPalette = function (plugIn) {
        if (!plugIn) {
            return false;
        }
        const candidates = [];
        try {
            if (plugIn.URL) {
                candidates.push(plugIn.URL.appendingPathComponent("Resources").appendingPathComponent("OpenFloatingPalette.app"));
                candidates.push(plugIn.URL.appendingPathComponent("OpenFloatingPalette.app"));
            }
        } catch (e) {
            // Ignore.
        }
        try {
            const named = plugIn.resourceNamed("OpenFloatingPalette.app");
            if (named) {
                candidates.unshift(named);
            }
        } catch (e) {
            // Ignore.
        }

        for (let i = 0; i < candidates.length; i++) {
            try {
                candidates[i].open();
                return true;
            } catch (e) {
                // Try the next location.
            }
        }

        try {
            if (plugIn.URL && plugIn.URL.path) {
                const appPath = String(plugIn.URL.path).replace(/\/$/, "") + "/Resources/OpenFloatingPalette.app";
                const appURL = URL.fromPath(appPath, true);
                appURL.open();
                return true;
            }
        } catch (e) {
            // Fall through to HTML.
        }

        try {
            const html = plugIn.resourceNamed("palette.html");
            if (html) {
                html.open();
                return true;
            }
        } catch (e) {
            // Ignore.
        }
        return false;
    };

    lib.modeFromAlertIndex = function (index) {
        if (index === 0) {
            return lib.MODE_RECTANGLE;
        }
        if (index === 1) {
            return lib.MODE_ORIGINAL;
        }
        return null;
    };

    lib.runSplit = function (selection, mode) {
        const result = lib.splitSelectedSolids(selection, mode);
        if (!result || result.created.length === 0) {
            const alert = new Alert(
                "OxHorse",
                "没有可按换行切分的图形。请选择包含至少两行文本的矩形或文本框。"
            );
            alert.show();
        }
        return result;
    };

    lib.splitSelectedSolids = function (selection, mode) {
        const created = [];
        let skipped = 0;
        if (!selection || !selection.solids) {
            return {created: created, skipped: skipped};
        }

        const gap = lib.spacingForCanvas(selection.canvas);
        const solids = [];
        for (let i = 0; i < selection.solids.length; i++) {
            solids.push(selection.solids[i]);
        }
        solids.sort(function (a, b) {
            const ay = lib.rectY(a.geometry);
            const by = lib.rectY(b.geometry);
            if (ay === by) {
                return lib.rectX(a.geometry) - lib.rectX(b.geometry);
            }
            return by - ay;
        });

        const canvas = selection.canvas;
        for (let i = 0; i < solids.length; i++) {
            const solid = solids[i];
            if (!lib.isSplittableSolid(solid)) {
                skipped += 1;
                continue;
            }
            const pieces = lib.splitSolid(solid, canvas, gap, mode);
            for (let j = 0; j < pieces.length; j++) {
                created.push(pieces[j]);
            }
        }

        if (created.length > 0 && selection.view) {
            try {
                selection.view.select(created, false);
            } catch (e) {
                // Ignore selection failures.
            }
        }

        return {created: created, skipped: skipped};
    };

    return lib;
})();
