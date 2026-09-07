ObjC.import("Cocoa");
ObjC.import("WebKit");
ObjC.import("stdlib");

const BUNDLE_ID = "com.lmg.omnigraffle.split-text-palette";

function jsString(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    try {
        if (typeof value.js === "string") {
            return value.js;
        }
    } catch (e) {
        // Ignore.
    }
    try {
        const unwrapped = ObjC.unwrap(value);
        if (typeof unwrapped === "string") {
            return unwrapped;
        }
    } catch (e) {
        // Ignore.
    }
    return String(value);
}

function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function writeTextFile(path, text) {
    const str = $.NSString.stringWithString(String(text));
    str.writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}

function readTextFile(path) {
    const str = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
    return jsString(str);
}

function decodeBase64Utf8(b64) {
    const data = $.NSData.alloc.initWithBase64EncodedStringOptions(b64, 0);
    const str = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
    return jsString(str);
}

function invokeOmni(js) {
    const omniPath = "/tmp/oxhorse-omni.js";
    const runPath = "/tmp/oxhorse-run.jxa";
    writeTextFile(omniPath, js);
    const runner = [
        "ObjC.import('Foundation');",
        "var path = '/tmp/oxhorse-omni.js';",
        "var ns = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);",
        "var code = (ns && ns.js) ? ns.js : String(ns);",
        "Application('OmniGraffle').evaluateJavascript(code);"
    ].join("\n");
    writeTextFile(runPath, runner);
    $.system("/usr/bin/osascript -l JavaScript " + shellQuote(runPath) + " >/dev/null 2>&1 &");
}

function invokeSplit(mode) {
    const splitMode = mode === "original" ? "original" : "rectangle";
    invokeOmni(
        "(function(){" +
        "var plugin=PlugIn.find('com.lmg.omnigraffle.split-text-to-rectangles');" +
        "if(!plugin){new Alert('OxHorse','插件未安装').show();return;}" +
        "var lib=plugin.library('SplitTextLib');" +
        "if(!lib){new Alert('OxHorse','找不到 SplitTextLib').show();return;}" +
        "var sel=document.windows && document.windows[0] ? document.windows[0].selection : null;" +
        "if(!sel){new Alert('OxHorse','没有打开的文档。').show();return;}" +
        "try{lib.runSplit(sel," + JSON.stringify(splitMode) + ");}" +
        "catch(e){new Alert('OxHorse', String(e && e.message ? e.message : e)).show();}" +
        "})()"
    );
}

function invokeRenderIR(ir) {
    const raw = typeof ir === "string" ? ir : JSON.stringify(ir);
    invokeOmni(
        "(function(){var p=PlugIn.find('com.lmg.omnigraffle.split-text-to-rectangles');" +
        "if(!p){new Alert('OxHorse','插件未安装').show();return 'missing';}" +
        "var lib=p.library('DrawLib');" +
        "if(!lib){new Alert('OxHorse','找不到 DrawLib').show();return 'nolib';}" +
        "try{return String(lib.renderJSON(" + JSON.stringify(raw) + "));}" +
        "catch(e){new Alert('OxHorse', String(e && e.message ? e.message : e)).show();return 'err';}" +
        "})()"
    );
}

function chatCompletions(provider, markdown) {
    const base = String(provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const url = base + "/chat/completions";
    const body = {
        model: provider.model || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: "You convert the user's Markdown into an OmniGraffle drawing IR. Reply with JSON only, no markdown fences. Schema: {\"layout\":\"TB\"|\"LR\",\"nodes\":[{\"id\":\"string\",\"text\":\"string\",\"shape\":\"rect|round|circle|diamond\"}],\"edges\":[{\"from\":\"id\",\"to\":\"id\",\"label\":\"optional\"}]}. Keep node ids simple. Use Chinese text from the user when present."
            },
            {
                role: "user",
                content: String(markdown || "")
            }
        ]
    };
    const reqPath = "/tmp/oxhorse-llm-req.json";
    const resPath = "/tmp/oxhorse-llm-res.json";
    writeTextFile(reqPath, JSON.stringify(body));
    const cmd = [
        "/usr/bin/curl -sS --max-time 60 -X POST",
        shellQuote(url),
        "-H", shellQuote("Content-Type: application/json"),
        "-H", shellQuote("Authorization: Bearer " + String(provider.apiKey || "")),
        "--data-binary", "@" + reqPath,
        "-o", shellQuote(resPath)
    ].join(" ");
    const code = $.system(cmd);
    if (code !== 0) {
        throw new Error("调用模型失败（curl " + code + "）");
    }
    const raw = readTextFile(resPath);
    let parsed = {};
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error("模型返回不是 JSON。");
    }
    if (parsed.error && parsed.error.message) {
        throw new Error(String(parsed.error.message));
    }
    const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
        ? parsed.choices[0].message.content
        : "";
    if (!content) {
        throw new Error("模型没有返回内容。");
    }
    return content;
}

function homeDirectory() {
    try {
        const env = $.NSProcessInfo.processInfo.environment;
        const home = jsString(env.objectForKey("HOME"));
        if (home) {
            return home;
        }
    } catch (e) {
        // Ignore.
    }
    try {
        return "/Users/" + jsString($.NSUserName());
    } catch (e2) {
        return "";
    }
}

function chooseExportPath() {
    const scriptPath = "/tmp/oxhorse-choose-export.applescript";
    const resultPath = "/tmp/oxhorse-export-path.txt";
    try {
        $.NSFileManager.defaultManager.removeItemAtPathError(resultPath, null);
    } catch (e) {
        // Ignore.
    }
    const script = [
        "try",
        "set theFile to choose file name with prompt \"导出 Markdown\" default name \"oxhorse.md\" default location (path to downloads folder)",
        "do shell script \"printf %s \" & quoted form of POSIX path of theFile & \" > " + resultPath + "\"",
        "on error",
        "do shell script \"rm -f " + resultPath + "\"",
        "end try"
    ].join("\n");
    writeTextFile(scriptPath, script);
    $.system("/usr/bin/osascript " + shellQuote(scriptPath));
    try {
        const chosen = readTextFile(resultPath).trim();
        return chosen || "";
    } catch (e2) {
        return "";
    }
}

function exportMarkdown(text) {
    const body = text == null ? "" : String(text);
    $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(0.08, false, function (timer) {
        try {
            const path = chooseExportPath();
            if (!path) {
                return;
            }
            writeTextFile(path, body);
            $.system("/usr/bin/open -R " + shellQuote(path));
        } catch (e) {
            const fallback = homeDirectory() + "/Downloads/oxhorse.md";
            writeTextFile(fallback, body);
            $.system("/usr/bin/open -R " + shellQuote(fallback));
        }
    });
}

function handlePayload(kind, jsonText) {
    const data = JSON.parse(jsonText);
    if (kind === "ir") {
        invokeRenderIR(data.ir || data);
        return;
    }
    if (kind === "llm") {
        const content = chatCompletions(data.provider || {}, data.markdown || "");
        invokeRenderIR(content);
        return;
    }
    if (kind === "export") {
        exportMarkdown(data.markdown || "");
    }
}

function otherRunningInstance() {
    const myPid = $.NSProcessInfo.processInfo.processIdentifier;
    const apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(BUNDLE_ID);
    const count = apps.count;
    for (let i = 0; i < count; i++) {
        const app = apps.objectAtIndex(i);
        if (app.processIdentifier !== myPid) {
            return app;
        }
    }
    return null;
}

function htmlFileURL() {
    const bundle = $.NSBundle.mainBundle;
    const path = bundle.pathForResourceOfType("palette", "html");
    if (path) {
        return $.NSURL.fileURLWithPath(path);
    }
    const appletPath = jsString(bundle.bundlePath);
    const sibling = appletPath.replace(/\/OpenFloatingPalette\.app\/?$/, "/palette.html");
    return $.NSURL.fileURLWithPath(sibling);
}

function pluginManifestPath() {
    const appletPath = jsString($.NSBundle.mainBundle.bundlePath);
    const resourcesDir = appletPath.replace(/\/OpenFloatingPalette\.app\/?$/, "");
    const pluginDir = resourcesDir.replace(/\/Resources\/?$/, "");
    return pluginDir + "/manifest.json";
}

function pluginVersionLabel() {
    try {
        const raw = readTextFile(pluginManifestPath());
        const json = JSON.parse(raw);
        if (json && json.version) {
            const v = String(json.version).trim();
            if (v) {
                return v.charAt(0) === "v" || v.charAt(0) === "V" ? v : "v" + v;
            }
        }
    } catch (e) {
        // Ignore.
    }
    return "v0.1.2";
}

function injectPluginVersion(webView, version) {
    const js =
        "(function(){var v=" + JSON.stringify(version) + ";" +
        "var el=document.getElementById('pluginVersion');" +
        "if(el){el.textContent=v;}" +
        "})()";
    $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(0.35, false, function (timer) {
        try {
            webView.evaluateJavaScriptCompletionHandler(js, null);
        } catch (e) {
            // Ignore: HTML already shows a fallback version.
        }
    });
}

function numberValue(value, fallback) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
}

function placeWindow(win, width, height) {
    let x = 240;
    let y = 180;
    try {
        const vis = $.NSScreen.mainScreen.visibleFrame;
        const origin = vis.origin || vis;
        const size = vis.size || vis;
        const sx = numberValue(origin.x, 0);
        const sy = numberValue(origin.y, 0);
        const sw = numberValue(size.width, width);
        const sh = numberValue(size.height, height);
        x = sx + Math.max(40, (sw - width) / 2);
        y = sy + Math.max(40, (sh - height) / 2);
    } catch (e) {
        // Keep the default origin.
    }
    try {
        win.frame = $.NSMakeRect(x, y, width, height);
    } catch (e) {
        // The window already has a usable default frame.
    }
}

function showWindow(win, nsApp) {
    try {
        if (typeof win.makeKeyAndOrderFront === "function") {
            win.makeKeyAndOrderFront(null);
        } else if (typeof win.orderFront === "function") {
            win.orderFront(null);
        }
    } catch (e) {
        // Ignore.
    }
    try {
        if (typeof nsApp.activateIgnoringOtherApps === "function") {
            nsApp.activateIgnoringOtherApps(true);
        }
    } catch (e) {
        // Ignore.
    }
}

function createWindow() {
    const nsApp = $.NSApplication.sharedApplication;
    try {
        nsApp.setActivationPolicy($.NSApplicationActivationPolicyRegular);
    } catch (e) {
        // Ignore.
    }

    const rect = $.NSMakeRect(240, 180, 760, 600);
    const style = (
        $.NSWindowStyleMaskTitled |
        $.NSWindowStyleMaskClosable |
        $.NSWindowStyleMaskMiniaturizable |
        $.NSWindowStyleMaskResizable
    );
    const window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
        rect,
        style,
        $.NSBackingStoreBuffered,
        false
    );
    window.title = "OxHorse";
    window.level = $.NSFloatingWindowLevel;
    window.hidesOnDeactivate = false;
    window.releasedWhenClosed = false;
    window.minSize = $.NSMakeSize(680, 500);

    const webView = $.WKWebView.alloc.initWithFrame(window.contentView.bounds);
    webView.autoresizingMask = $.NSViewWidthSizable | $.NSViewHeightSizable;

    const fileURL = htmlFileURL();
    const request = $.NSURLRequest.requestWithURL(fileURL);
    webView.loadRequest(request);
    window.contentView.addSubview(webView);
    injectPluginVersion(webView, pluginVersionLabel());

    const keep = {
        window: window,
        webView: webView,
        lastTitle: "",
        buffers: {},
        observer: null,
        timer: null
    };

    keep.observer = $.NSNotificationCenter.defaultCenter.addObserverForNameObjectQueueUsingBlock(
        $.NSWindowWillCloseNotification,
        window,
        $.NSOperationQueue.mainQueue,
        function (note) {
            $.NSApplication.sharedApplication.terminate(null);
        }
    );

    keep.timer = $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(0.2, true, function (timer) {
        try {
            const title = jsString(keep.webView.title);
            if (!title || title === keep.lastTitle || title === "OxHorse") {
                return;
            }
            keep.lastTitle = title;

            const split = title.match(/^ogsplit:(rectangle|original):(\d+)$/);
            if (split) {
                invokeSplit(split[1]);
                return;
            }

            const begin = title.match(/^ogbegin:(\d+):(\d+)$/);
            if (begin) {
                keep.buffers[begin[1]] = { total: Number(begin[2]), parts: [] };
                return;
            }

            const part = title.match(/^ogpart:(\d+):(\d+):(.*)$/);
            if (part) {
                const buf = keep.buffers[part[1]] || { total: 0, parts: [] };
                buf.parts[Number(part[2])] = part[3];
                keep.buffers[part[1]] = buf;
                return;
            }

            const end = title.match(/^ogend:(\d+):(ir|llm|export)$/);
            if (end) {
                const buf = keep.buffers[end[1]];
                delete keep.buffers[end[1]];
                if (!buf) {
                    return;
                }
                const joined = buf.parts.join("");
                const jsonText = decodeBase64Utf8(joined);
                try {
                    handlePayload(end[2], jsonText);
                } catch (err) {
                    const message = String(err && err.message ? err.message : err);
                    invokeOmni("(function(){new Alert('OxHorse'," + JSON.stringify(message) + ").show();})()");
                }
            }
        } catch (e) {
            // Never throw from a timer callback.
        }
    });

    $.SplitPaletteKeepAlive = keep;

    placeWindow(window, 760, 600);
    showWindow(window, nsApp);
    try {
        if (typeof nsApp.run === "function") {
            nsApp.run();
        }
    } catch (e) {
        // Ignore.
    }
}

const existing = otherRunningInstance();
if (existing) {
    existing.activateWithOptions($.NSApplicationActivateIgnoringOtherApps);
} else {
    createWindow();
}
