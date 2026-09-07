(() => {
    const action = new PlugIn.Action(function (selection, sender) {
        try {
            const lib = action.plugIn.library("SplitTextLib");
            const sel = (selection && selection.solids) ? selection : document.windows[0].selection;
            lib.runSplit(sel, lib.MODE_RECTANGLE);
        } catch (err) {
            const title = err && err.name ? err.name : "错误";
            const message = err && err.message ? err.message : String(err);
            new Alert(title, message).show();
            console.error(err);
        }
    });

    action.validate = function (selection, sender) {
        try {
            const lib = action.plugIn.library("SplitTextLib");
            const sel = (selection && selection.solids) ? selection : document.windows[0].selection;
            return lib.hasSplittableSolids(sel);
        } catch (err) {
            return false;
        }
    };

    return action;
})();
