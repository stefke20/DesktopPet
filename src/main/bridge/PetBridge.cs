// DesktopPet native helper (Windows only). Compiled on first run with the
// csc.exe that ships with .NET Framework 4.x (present on every Windows 10/11).
//
// Protocol: one request per line on stdin:   <id>\t<command>\t<arg>...
//           one response per line on stdout: <id>\t<json>
// Coordinates are physical screen pixels (the process is per-monitor DPI aware).
//
// Commands
//   ping
//   windows <excludePid>              visible top-level windows, top-most first
//   fields <hwnd>                     text boxes (UI Automation) inside a window
//   icons                             desktop icons (position + icon rect)
//   iconimg <name> <size>             PNG (base64) of a desktop icon
//   moveicon <name> <iconLeft> <iconTop>   move an icon (screen px of its icon rect)
//   park <name>                       move an icon far off-screen (hidden)
//
// Desktop icons are moved with LVM_SETITEMPOSITION on the desktop's SysListView32.
// The app records every original position first, so "Reset" can always restore them.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
#if !NO_UIA
using System.Windows.Automation;
#endif

static class Native
{
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, int flags);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);
    [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] public static extern IntPtr VirtualAllocEx(IntPtr p, IntPtr addr, UIntPtr size, uint type, uint prot);
    [DllImport("kernel32.dll")] public static extern bool VirtualFreeEx(IntPtr p, IntPtr addr, UIntPtr size, uint type);
    [DllImport("kernel32.dll")] public static extern bool ReadProcessMemory(IntPtr p, IntPtr addr, byte[] buf, int size, out IntPtr read);
    [DllImport("kernel32.dll")] public static extern bool WriteProcessMemory(IntPtr p, IntPtr addr, byte[] buf, int size, out IntPtr written);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
    [DllImport("gdi32.dll")] public static extern int GetObject(IntPtr h, int size, ref DIBSECTION ds);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    public static extern void SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr pbc, ref Guid riid,
        [MarshalAs(UnmanagedType.Interface, IidParameterIndex = 2)] out IShellItemImageFactory ppv);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public int flags; }
    [StructLayout(LayoutKind.Sequential)]
    public struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public short bmPlanes, bmBitsPixel; public IntPtr bmBits; }
    [StructLayout(LayoutKind.Sequential)]
    public struct BITMAPINFOHEADER { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant; }
    [StructLayout(LayoutKind.Sequential)]
    public struct DIBSECTION { public BITMAP dsBm; public BITMAPINFOHEADER dsBmih; public int dsBitfields0, dsBitfields1, dsBitfields2; public IntPtr dshSection; public int dsOffset; }

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr hbitmap); }
}

class IconInfo
{
    public int Index; public string Name;
    public int PosX, PosY;                 // item origin, screen px
    public int IL, IT, IR, IB;             // icon rect, screen px
    public int BL, BT, BR, BB;             // bounds (icon + label), screen px
}

static class Json
{
    public static string S(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (char c in s ?? "")
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c);
                    break;
            }
        }
        return sb.Append('"').ToString();
    }
}

class Remote : IDisposable
{
    IntPtr proc, mem; uint size;
    public Remote(IntPtr hwnd, uint size)
    {
        this.size = size;
        uint pid; Native.GetWindowThreadProcessId(hwnd, out pid);
        proc = Native.OpenProcess(0x0008 | 0x0010 | 0x0020 | 0x0400, false, pid); // VM_OPERATION|VM_READ|VM_WRITE|QUERY_INFORMATION
        if (proc == IntPtr.Zero) throw new Exception("OpenProcess failed (" + Marshal.GetLastWin32Error() + ")");
        mem = Native.VirtualAllocEx(proc, IntPtr.Zero, (UIntPtr)size, 0x3000, 0x04);
        if (mem == IntPtr.Zero) throw new Exception("VirtualAllocEx failed");
    }
    public IntPtr Ptr { get { return mem; } }
    public void Write(int offset, byte[] data) { IntPtr w; Native.WriteProcessMemory(proc, mem + offset, data, data.Length, out w); }
    public byte[] Read(int offset, int n) { var b = new byte[n]; IntPtr r; Native.ReadProcessMemory(proc, mem + offset, b, n, out r); return b; }
    public void Dispose()
    {
        if (mem != IntPtr.Zero) Native.VirtualFreeEx(proc, mem, UIntPtr.Zero, 0x8000);
        if (proc != IntPtr.Zero) Native.CloseHandle(proc);
    }
}

static class Desktop
{
    const int LVM_GETITEMCOUNT = 0x1004, LVM_GETITEMRECT = 0x100E, LVM_SETITEMPOSITION = 0x100F,
        LVM_GETITEMPOSITION = 0x1010, LVM_GETITEMTEXTW = 0x1073, LVM_GETEXTENDEDLISTVIEWSTYLE = 0x1037;
    const int LVS_AUTOARRANGE = 0x100;

    public static IntPtr FindListView()
    {
        IntPtr progman = Native.FindWindow("Progman", null);
        IntPtr defView = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (defView == IntPtr.Zero)
        {
            IntPtr found = IntPtr.Zero;
            Native.EnumWindows((h, l) =>
            {
                var cls = new StringBuilder(64); Native.GetClassName(h, cls, 64);
                if (cls.ToString() != "WorkerW") return true;
                IntPtr dv = Native.FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (dv != IntPtr.Zero) { found = dv; return false; }
                return true;
            }, IntPtr.Zero);
            defView = found;
        }
        if (defView == IntPtr.Zero) return IntPtr.Zero;
        return Native.FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
    }

    public static bool AutoArrange(IntPtr lv) { return (Native.GetWindowLong(lv, -16) & LVS_AUTOARRANGE) != 0; }

    public static List<IconInfo> List(IntPtr lv)
    {
        var list = new List<IconInfo>();
        int count = (int)(long)Native.SendMessage(lv, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
        var origin = new Native.POINT(); Native.ClientToScreen(lv, ref origin);
        int ptr = IntPtr.Size;
        using (var rm = new Remote(lv, 1024))
        {
            for (int i = 0; i < count; i++)
            {
                var ic = new IconInfo { Index = i };
                // position
                Native.SendMessage(lv, LVM_GETITEMPOSITION, (IntPtr)i, rm.Ptr);
                var pb = rm.Read(0, 8);
                ic.PosX = BitConverter.ToInt32(pb, 0) + origin.x; ic.PosY = BitConverter.ToInt32(pb, 4) + origin.y;
                // icon rect (LVIR_ICON = 1) and bounds (LVIR_BOUNDS = 0)
                for (int pass = 0; pass < 2; pass++)
                {
                    rm.Write(0, BitConverter.GetBytes(pass == 0 ? 1 : 0));
                    rm.Write(4, new byte[12]);
                    Native.SendMessage(lv, LVM_GETITEMRECT, (IntPtr)i, rm.Ptr);
                    var rb = rm.Read(0, 16);
                    int l = BitConverter.ToInt32(rb, 0) + origin.x, t = BitConverter.ToInt32(rb, 4) + origin.y;
                    int r = BitConverter.ToInt32(rb, 8) + origin.x, b = BitConverter.ToInt32(rb, 12) + origin.y;
                    if (pass == 0) { ic.IL = l; ic.IT = t; ic.IR = r; ic.IB = b; } else { ic.BL = l; ic.BT = t; ic.BR = r; ic.BB = b; }
                }
                // text: LVITEMW at offset 0, text buffer at offset 256
                var item = new byte[ptr == 8 ? 88 : 60];
                Array.Copy(BitConverter.GetBytes(1), 0, item, 0, 4);                  // mask = LVIF_TEXT
                Array.Copy(BitConverter.GetBytes(i), 0, item, 4, 4);                  // iItem
                int textOff = ptr == 8 ? 24 : 20;
                long textPtr = (long)rm.Ptr + 256;
                Array.Copy(ptr == 8 ? BitConverter.GetBytes(textPtr) : BitConverter.GetBytes((int)textPtr), 0, item, textOff, ptr);
                Array.Copy(BitConverter.GetBytes(256), 0, item, textOff + ptr, 4);    // cchTextMax
                rm.Write(0, item);
                rm.Write(256, new byte[512]);
                Native.SendMessage(lv, LVM_GETITEMTEXTW, (IntPtr)i, rm.Ptr);
                var tb = rm.Read(256, 512);
                ic.Name = Encoding.Unicode.GetString(tb).Split('\0')[0];
                list.Add(ic);
            }
        }
        return list;
    }

    // iconLeft/iconTop: where the *icon rect* should end up, in screen px.
    public static void Move(IntPtr lv, IconInfo ic, int iconLeft, int iconTop)
    {
        var origin = new Native.POINT(); Native.ClientToScreen(lv, ref origin);
        int offX = ic.IL - ic.PosX, offY = ic.IT - ic.PosY;           // icon rect offset from the item origin
        int x = iconLeft - offX - origin.x, y = iconTop - offY - origin.y;
        SetPos(lv, ic.Index, x, y);
    }

    public static void SetPos(IntPtr lv, int index, int x, int y)
    {
        // LVM_SETITEMPOSITION packs x,y as signed 16-bit values into lParam.
        int lp = ((short)y << 16) | ((short)x & 0xFFFF);
        Native.SendMessage(lv, LVM_SETITEMPOSITION, (IntPtr)index, (IntPtr)lp);
    }

    static readonly Dictionary<string, string> Special = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { "This PC", "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}" },
        { "Computer", "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}" },
        { "Recycle Bin", "::{645FF040-5081-101B-9F08-00AA002F954E}" },
        { "Network", "::{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}" },
        { "Control Panel", "::{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}" },
        { "Documents", "::{450D8FBA-AD25-11D0-98A8-0800361B1103}" },
    };

    public static string ParsingPath(string name)
    {
        string sp;
        if (Special.TryGetValue(name, out sp)) return sp;
        if (name.Equals(Environment.UserName, StringComparison.OrdinalIgnoreCase)) return "::{59031A47-3F72-44A7-89C5-5595FE6B30EE}";
        foreach (var dir in new[] { Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory) })
        {
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) continue;
            foreach (var entry in Directory.GetFileSystemEntries(dir))
            {
                string leaf = Path.GetFileName(entry), bare = Path.GetFileNameWithoutExtension(entry);
                if (leaf.Equals(name, StringComparison.OrdinalIgnoreCase) || bare.Equals(name, StringComparison.OrdinalIgnoreCase)) return entry;
            }
        }
        return null;
    }

    public static string IconPng(string name, int size)
    {
        string path = ParsingPath(name);
        if (path == null) return null;
        var iid = typeof(Native.IShellItemImageFactory).GUID;
        Native.IShellItemImageFactory fac;
        Native.SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out fac);
        IntPtr hbm;
        int hr = fac.GetImage(new Native.SIZE { cx = size, cy = size }, 0x4 | 0x1, out hbm);   // ICONONLY | BIGGERSIZEOK
        if (hr != 0 || hbm == IntPtr.Zero) return null;
        try
        {
            var ds = new Native.DIBSECTION();
            int got = Native.GetObject(hbm, Marshal.SizeOf(typeof(Native.DIBSECTION)), ref ds);
            if (got == 0 || ds.dsBm.bmBits == IntPtr.Zero || ds.dsBm.bmBitsPixel != 32) return null;
            // shell bitmaps carry premultiplied alpha; bottom-up DIBs (positive height) need a vertical flip
            using (var raw = new Bitmap(ds.dsBm.bmWidth, ds.dsBm.bmHeight, ds.dsBm.bmWidthBytes, PixelFormat.Format32bppPArgb, ds.dsBm.bmBits))
            using (var copy = new Bitmap(ds.dsBm.bmWidth, ds.dsBm.bmHeight, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(copy))
                {
                    g.Clear(Color.Transparent);
                    g.DrawImageUnscaled(raw, 0, 0);
                }
                if (ds.dsBmih.biHeight > 0) copy.RotateFlip(RotateFlipType.RotateNoneFlipY);
                using (var ms = new MemoryStream())
                {
                    copy.Save(ms, ImageFormat.Png);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }
        finally { Native.DeleteObject(hbm); }
    }
}

static class Server
{
    static readonly object outLock = new object();
    static int selfPid;

    static void Reply(string id, string json)
    {
        lock (outLock) { Console.Out.Write(id + "\t" + json + "\n"); Console.Out.Flush(); }
    }

    [STAThread]
    static int Main(string[] args)
    {
        try { Native.SetProcessDpiAwarenessContext((IntPtr)(-4)); } catch { }
        Console.OutputEncoding = new UTF8Encoding(false);
        var stdin = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
        string line;
        while ((line = stdin.ReadLine()) != null)
        {
            var parts = line.Split('\t');
            if (parts.Length < 2) continue;
            string id = parts[0], cmd = parts[1];
            var rest = new string[parts.Length - 2];
            Array.Copy(parts, 2, rest, 0, rest.Length);
            if (cmd == "fields" || cmd == "iconimg")
            {
                // slow calls run off the request loop so window polling is never blocked
                var t = new Thread(() => Handle(id, cmd, rest)) { IsBackground = true };
                t.SetApartmentState(ApartmentState.MTA);
                t.Start();
            }
            else Handle(id, cmd, rest);
        }
        return 0;
    }

    static void Handle(string id, string cmd, string[] a)
    {
        try
        {
            string json;
            switch (cmd)
            {
                case "ping": json = "{\"ok\":true,\"uia\":" + (Uia.Available ? "true" : "false") + "}"; break;
                case "windows": json = Windows(a.Length > 0 ? int.Parse(a[0]) : 0); break;
                case "fields": json = Uia.Fields(new IntPtr(long.Parse(a[0]))); break;
                case "icons": json = Icons(); break;
                case "iconimg": { var b64 = Desktop.IconPng(a[0], a.Length > 1 ? int.Parse(a[1]) : 128); json = b64 == null ? "null" : Json.S(b64); break; }
                case "moveicon": json = MoveIcon(a[0], int.Parse(a[1]), int.Parse(a[2])); break;
                case "park": json = MoveIcon(a[0], -5000, -5000); break;
                default: json = "{\"error\":\"unknown command\"}"; break;
            }
            Reply(id, json);
        }
        catch (Exception e)
        {
            Reply(id, "{\"error\":" + Json.S(e.GetType().Name + ": " + e.Message) + "}");
        }
    }

    static string Windows(int excludePid)
    {
        selfPid = excludePid;
        IntPtr fg = Native.GetForegroundWindow();
        var sb = new StringBuilder("[");
        bool first = true;
        Native.EnumWindows((h, l) =>
        {
            if (!Native.IsWindowVisible(h) || Native.IsIconic(h)) return true;
            int ex = Native.GetWindowLong(h, -20);
            bool tool = (ex & 0x80) != 0, appw = (ex & 0x40000) != 0, noact = (ex & 0x08000000) != 0;
            if ((tool || noact) && !appw) return true;
            int cloaked; Native.DwmGetWindowAttribute(h, 14, out cloaked, 4);
            if (cloaked != 0) return true;
            uint pid; Native.GetWindowThreadProcessId(h, out pid);
            if (excludePid != 0 && pid == (uint)excludePid) return true;
            var cls = new StringBuilder(128); Native.GetClassName(h, cls, 128);
            string c = cls.ToString();
            if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "XamlExplorerHostIslandWindow" || c == "Windows.UI.Core.CoreWindow") return true;
            var title = new StringBuilder(256); Native.GetWindowText(h, title, 256);
            if (title.Length == 0) return true;
            Native.RECT r;
            if (Native.DwmGetWindowAttribute(h, 9, out r, 16) != 0) Native.GetWindowRect(h, out r);
            int w = r.right - r.left, hh = r.bottom - r.top;
            if (w < 120 || hh < 60) return true;
            bool full = false;
            IntPtr mon = Native.MonitorFromWindow(h, 2);
            if (mon != IntPtr.Zero)
            {
                var mi = new Native.MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(Native.MONITORINFO));
                if (Native.GetMonitorInfo(mon, ref mi))
                    full = r.left <= mi.rcMonitor.left && r.top <= mi.rcMonitor.top && r.right >= mi.rcMonitor.right && r.bottom >= mi.rcMonitor.bottom;
            }
            if (!first) sb.Append(',');
            first = false;
            sb.Append("{\"h\":").Append((long)h).Append(",\"title\":").Append(Json.S(title.ToString()))
              .Append(",\"cls\":").Append(Json.S(c)).Append(",\"pid\":").Append(pid)
              .Append(",\"x\":").Append(r.left).Append(",\"y\":").Append(r.top).Append(",\"w\":").Append(w).Append(",\"hh\":").Append(hh)
              .Append(",\"fg\":").Append(h == fg ? "true" : "false")
              .Append(",\"max\":").Append(Native.IsZoomed(h) ? "true" : "false")
              .Append(",\"full\":").Append(full ? "true" : "false").Append('}');
            return true;
        }, IntPtr.Zero);
        return sb.Append(']').ToString();
    }

    static string Icons()
    {
        IntPtr lv = Desktop.FindListView();
        if (lv == IntPtr.Zero) return "{\"error\":\"desktop list view not found\"}";
        var list = Desktop.List(lv);
        Native.RECT lr; Native.GetWindowRect(lv, out lr);
        var sb = new StringBuilder("{\"auto\":").Append(Desktop.AutoArrange(lv) ? "true" : "false");
        sb.Append(",\"bounds\":{\"x\":").Append(lr.left).Append(",\"y\":").Append(lr.top).Append(",\"w\":").Append(lr.right - lr.left).Append(",\"h\":").Append(lr.bottom - lr.top).Append("},\"list\":[");
        for (int i = 0; i < list.Count; i++)
        {
            var ic = list[i];
            if (i > 0) sb.Append(',');
            sb.Append("{\"name\":").Append(Json.S(ic.Name))
              .Append(",\"x\":").Append(ic.PosX).Append(",\"y\":").Append(ic.PosY)
              .Append(",\"ix\":").Append(ic.IL).Append(",\"iy\":").Append(ic.IT).Append(",\"iw\":").Append(ic.IR - ic.IL).Append(",\"ih\":").Append(ic.IB - ic.IT)
              .Append(",\"bx\":").Append(ic.BL).Append(",\"by\":").Append(ic.BT).Append(",\"bw\":").Append(ic.BR - ic.BL).Append(",\"bh\":").Append(ic.BB - ic.BT).Append('}');
        }
        return sb.Append("]}").ToString();
    }

    static string MoveIcon(string name, int left, int top)
    {
        IntPtr lv = Desktop.FindListView();
        if (lv == IntPtr.Zero) return "{\"error\":\"desktop list view not found\"}";
        foreach (var ic in Desktop.List(lv))
        {
            if (ic.Name != name) continue;
            Desktop.Move(lv, ic, left, top);
            return "{\"ok\":true}";
        }
        return "{\"error\":\"icon not found\"}";
    }
}

static class Uia
{
#if NO_UIA
    public static bool Available { get { return false; } }
    public static string Fields(IntPtr hwnd) { return "[]"; }
#else
    public static bool Available { get { return true; } }

    // Edit boxes and editable combo boxes (Chrome/Edge/Firefox expose web inputs this way).
    public static string Fields(IntPtr hwnd)
    {
        var root = AutomationElement.FromHandle(hwnd);
        var cond = new OrCondition(
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ComboBox));
        var found = root.FindAll(TreeScope.Descendants, cond);
        var sb = new StringBuilder("[");
        int n = 0;
        foreach (AutomationElement el in found)
        {
            if (n >= 40) break;
            try
            {
                if (el.Current.IsOffscreen) continue;
                var r = el.Current.BoundingRectangle;
                if (r.IsEmpty || r.Width < 120 || r.Height < 16 || r.Height > 140) continue;
                if (n++ > 0) sb.Append(',');
                sb.Append("{\"x\":").Append((int)r.X).Append(",\"y\":").Append((int)r.Y)
                  .Append(",\"w\":").Append((int)r.Width).Append(",\"hh\":").Append((int)r.Height).Append('}');
            }
            catch { }
        }
        return sb.Append(']').ToString();
    }
#endif
}
