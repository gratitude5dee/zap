-- Omarchy's ~/.config/hypr/monitors.lua, replaced for an agent's machine.
--
-- Omarchy (quattro) configures Hyprland in Lua and loads the user's
-- monitors.lua after its own defaults, so overriding this one file adapts the
-- real Omarchy desktop to "no physical monitor, no human at the keyboard"
-- without forking any of its theming or keybinds.

-- Hyprland drives the box's vkms virtual display (no GPU, no EDID), so match
-- every output and fix the size. This is also the resolution the human sees
-- when they watch or take over the screen.
hl.monitor({ output = "", mode = "1920x1080@60", position = "0x0", scale = 1 })

-- X11/Xwayland windows stay unscaled: the agent's browser is an X client on
-- this desktop, and its screenshots and click coordinates must match the
-- pixels it is told about.
hl.env("GDK_SCALE", "1")
hl.env("XCURSOR_SIZE", "24")
