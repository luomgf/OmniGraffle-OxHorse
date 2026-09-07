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

function invokeSplit(mode) {
    const actionName = mode === "original" ? "splitAsOriginal" : "splitAsRectangle";
    const omniJS = [
        "(function(){",
        "var plugin=PlugIn.find('com.lmg.omnigraffle.split-text-to-rectangles');",
        "if(!plugin){new Alert('OxHorse','插件未安装').show();return;}",
        "var act=plugin.action('" + actionName + "');",
        "if(!act){new Alert('OxHorse','请安装插件包 split-text-to-rectangles.omnigrafflejs。').show();return;}",
        "act.perform();",
        "})()"
    ].join("");
    const jxa = "Application('OmniGraffle').evaluateJavascript(" + JSON.stringify(omniJS) + ")";
    $.system("/usr/bin/osascript -l JavaScript -e " + shellQuote(jxa) + " >/dev/null 2>&1 &");
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

    const rect = $.NSMakeRect(240, 180, 380, 560);
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
    window.minSize = $.NSMakeSize(320, 420);

    const webView = $.WKWebView.alloc.initWithFrame(window.contentView.bounds);
    webView.autoresizingMask = $.NSViewWidthSizable | $.NSViewHeightSizable;

    const fileURL = htmlFileURL();
    try {
        const dirURL = fileURL.URLByDeletingLastPathComponent;
        webView.loadFileURLAllowingReadAccessToURL(fileURL, dirURL);
    } catch (e) {
        const request = $.NSURLRequest.requestWithURL(fileURL);
        webView.loadRequest(request);
    }
    window.contentView.addSubview(webView);

    const keep = {
        window: window,
        webView: webView,
        lastTs: "",
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

    keep.timer = $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(0.3, true, function (timer) {
        try {
            const title = jsString(keep.webView.title);
            const match = title.match(/^ogsplit:(rectangle|original):(\d+)$/);
            if (!match) {
                return;
            }
            if (match[2] === keep.lastTs) {
                return;
            }
            keep.lastTs = match[2];
            invokeSplit(match[1]);
        } catch (e) {
            // Never throw from a timer callback.
        }
    });

    $.SplitPaletteKeepAlive = keep;

    placeWindow(window, 380, 560);
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
