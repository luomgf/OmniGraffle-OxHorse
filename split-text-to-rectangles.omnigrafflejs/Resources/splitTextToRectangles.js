(() => {
    const action = new PlugIn.Action(function (selection, sender) {
        try {
            const lib = action.plugIn.library("SplitTextLib");
            const opened = lib.openFloatingPalette(action.plugIn);
            if (!opened) {
                new Alert("OxHorse", "无法打开浮动窗口。请确认插件包内包含 palette.html。").show();
            }
        } catch (err) {
            const title = err && err.name ? err.name : "错误";
            const message = err && err.message ? err.message : String(err);
            new Alert(title, message).show();
            console.error(err);
        }
    });

    action.validate = function (selection, sender) {
        return true;
    };

    return action;
})();
