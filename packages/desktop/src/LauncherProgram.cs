using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace FourRent.Launcher
{
    public class LauncherForm : Form
    {
        private TextBox txtPropertyCode;
        private Label lblStatus;
        private Button btnLaunch;
        private Button btnCreateShortcut;
        private string iconPath;

        public LauncherForm(string icoPath)
        {
            this.iconPath = icoPath;
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "4Rent Management System — Official Desktop Launcher";
            this.ClientSize = new Size(580, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(11, 15, 23);
            this.ForeColor = Color.FromArgb(241, 245, 249);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            if (File.Exists(iconPath))
            {
                try
                {
                    this.Icon = new Icon(iconPath);
                }
                catch { }
            }

            // --- Header Panel ---
            Panel pnlHeader = new Panel();
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Size = new Size(580, 95);
            pnlHeader.BackColor = Color.FromArgb(18, 24, 36);
            this.Controls.Add(pnlHeader);

            // Icon / Badge
            Label lblBadge = new Label();
            lblBadge.Text = "4R";
            lblBadge.Font = new Font("Segoe UI Black", 18f, FontStyle.Bold);
            lblBadge.ForeColor = Color.FromArgb(245, 158, 11);
            lblBadge.BackColor = Color.FromArgb(11, 15, 23);
            lblBadge.TextAlign = ContentAlignment.MiddleCenter;
            lblBadge.Location = new Point(22, 18);
            lblBadge.Size = new Size(58, 58);
            pnlHeader.Controls.Add(lblBadge);

            // App Title
            Label lblTitle = new Label();
            lblTitle.Text = "4Rent Management System";
            lblTitle.Font = new Font("Segoe UI", 15f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(90, 18);
            lblTitle.AutoSize = true;
            pnlHeader.Controls.Add(lblTitle);

            // Subtitle
            Label lblSub = new Label();
            lblSub.Text = "Standalone Desktop Launcher & Window Host v1.0.0";
            lblSub.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
            lblSub.ForeColor = Color.FromArgb(148, 163, 184);
            lblSub.Location = new Point(92, 48);
            lblSub.AutoSize = true;
            pnlHeader.Controls.Add(lblSub);

            // Gold Header Accent Line
            Panel pnlLine = new Panel();
            pnlLine.Location = new Point(0, 94);
            pnlLine.Size = new Size(580, 2);
            pnlLine.BackColor = Color.FromArgb(245, 158, 11);
            this.Controls.Add(pnlLine);

            // --- Instructions Box ---
            Label lblInstructHeading = new Label();
            lblInstructHeading.Text = "SYSTEM INSTRUCTIONS & USAGE";
            lblInstructHeading.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lblInstructHeading.ForeColor = Color.FromArgb(245, 158, 11);
            lblInstructHeading.Location = new Point(24, 112);
            lblInstructHeading.AutoSize = true;
            this.Controls.Add(lblInstructHeading);

            TextBox txtInstructions = new TextBox();
            txtInstructions.Multiline = true;
            txtInstructions.ReadOnly = true;
            txtInstructions.BackColor = Color.FromArgb(16, 22, 33);
            txtInstructions.ForeColor = Color.FromArgb(226, 232, 240);
            txtInstructions.BorderStyle = BorderStyle.FixedSingle;
            txtInstructions.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
            txtInstructions.Location = new Point(24, 134);
            txtInstructions.Size = new Size(532, 160);
            txtInstructions.Text =
                "1. Standalone Window Mode:\r\n" +
                "   Launches 4Rent in an isolated, full-screen desktop window powered by your\r\n" +
                "   Windows browser runtime (Microsoft Edge / Chrome) with zero browser toolbars.\r\n\r\n" +
                "2. Sub-Meter OCR & Billing Engine:\r\n" +
                "   Features automated mechanical cyclometer readout, 1:1 image lightbox,\r\n" +
                "   official billing statement generation, and direct Messenger sharing.\r\n\r\n" +
                "3. Multi-User Property Code:\r\n" +
                "   Data is isolated by Property Space Code so multiple landlords / users operate\r\n" +
                "   independently. Keep '4RENT-MAIN' or enter your custom private Property Code.";
            this.Controls.Add(txtInstructions);

            // --- Property Space Code Setting ---
            Label lblPropCode = new Label();
            lblPropCode.Text = "Property Space Code (Multi-User Partition):";
            lblPropCode.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            lblPropCode.ForeColor = Color.FromArgb(203, 213, 225);
            lblPropCode.Location = new Point(24, 308);
            lblPropCode.AutoSize = true;
            this.Controls.Add(lblPropCode);

            txtPropertyCode = new TextBox();
            txtPropertyCode.Text = "4RENT-MAIN";
            txtPropertyCode.Font = new Font("Consolas", 11f, FontStyle.Bold);
            txtPropertyCode.BackColor = Color.FromArgb(22, 30, 46);
            txtPropertyCode.ForeColor = Color.FromArgb(245, 158, 11);
            txtPropertyCode.BorderStyle = BorderStyle.FixedSingle;
            txtPropertyCode.Location = new Point(24, 330);
            txtPropertyCode.Size = new Size(260, 28);
            this.Controls.Add(txtPropertyCode);

            Label lblPropHint = new Label();
            lblPropHint.Text = "Default: 4RENT-MAIN (Share this code to sync phone & PC)";
            lblPropHint.Font = new Font("Segoe UI", 8f, FontStyle.Italic);
            lblPropHint.ForeColor = Color.FromArgb(100, 116, 139);
            lblPropHint.Location = new Point(292, 336);
            lblPropHint.AutoSize = true;
            this.Controls.Add(lblPropHint);

            // --- Action Buttons ---
            btnLaunch = new Button();
            btnLaunch.Text = "▶   Launch 4Rent Standalone Desktop App";
            btnLaunch.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            btnLaunch.BackColor = Color.FromArgb(245, 158, 11);
            btnLaunch.ForeColor = Color.FromArgb(11, 15, 23);
            btnLaunch.FlatStyle = FlatStyle.Flat;
            btnLaunch.FlatAppearance.BorderSize = 0;
            btnLaunch.Location = new Point(24, 378);
            btnLaunch.Size = new Size(532, 46);
            btnLaunch.Cursor = Cursors.Hand;
            btnLaunch.Click += new EventHandler(OnLaunchClicked);
            this.Controls.Add(btnLaunch);

            btnCreateShortcut = new Button();
            btnCreateShortcut.Text = "📌   Pin / Create Windows Desktop Shortcut (with Icon)";
            btnCreateShortcut.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnCreateShortcut.BackColor = Color.FromArgb(24, 33, 49);
            btnCreateShortcut.ForeColor = Color.FromArgb(226, 232, 240);
            btnCreateShortcut.FlatStyle = FlatStyle.Flat;
            btnCreateShortcut.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnCreateShortcut.Location = new Point(24, 432);
            btnCreateShortcut.Size = new Size(532, 38);
            btnCreateShortcut.Cursor = Cursors.Hand;
            btnCreateShortcut.Click += new EventHandler(OnCreateShortcutClicked);
            this.Controls.Add(btnCreateShortcut);

            // --- Status Footer ---
            lblStatus = new Label();
            lblStatus.Text = "Status: Ready • Zero installation required";
            lblStatus.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(148, 163, 184);
            lblStatus.Location = new Point(24, 485);
            lblStatus.AutoSize = true;
            this.Controls.Add(lblStatus);

            Button btnExit = new Button();
            btnExit.Text = "Exit";
            btnExit.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            btnExit.BackColor = Color.FromArgb(16, 22, 33);
            btnExit.ForeColor = Color.FromArgb(148, 163, 184);
            btnExit.FlatStyle = FlatStyle.Flat;
            btnExit.FlatAppearance.BorderColor = Color.FromArgb(30, 41, 59);
            btnExit.Location = new Point(486, 480);
            btnExit.Size = new Size(70, 28);
            btnExit.Cursor = Cursors.Hand;
            btnExit.Click += (s, e) => this.Close();
            this.Controls.Add(btnExit);
        }

        private string GetTargetAppUrl()
        {
            string code = (txtPropertyCode != null && !string.IsNullOrEmpty(txtPropertyCode.Text))
                ? txtPropertyCode.Text.Trim()
                : "4RENT-MAIN";
            return "https://splikaa.github.io/4Rent/?desktop=1&prop=" + Uri.EscapeDataString(code);
        }

        private static string FindBrowserExecutable()
        {
            string edgeProg86 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\Edge\\Application\\msedge.exe");
            if (File.Exists(edgeProg86)) return edgeProg86;

            string edgeProg = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\Edge\\Application\\msedge.exe");
            if (File.Exists(edgeProg)) return edgeProg;

            string chromeProg = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google\\Chrome\\Application\\chrome.exe");
            if (File.Exists(chromeProg)) return chromeProg;

            string chromeProg86 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google\\Chrome\\Application\\chrome.exe");
            if (File.Exists(chromeProg86)) return chromeProg86;

            return null;
        }

        public static bool LaunchApp(string url)
        {
            string browser = FindBrowserExecutable();
            try
            {
                if (!string.IsNullOrEmpty(browser))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = browser;
                    psi.Arguments = "--app=\"" + url + "\" --start-maximized";
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                    return true;
                }
                else
                {
                    Process.Start(url);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        public static bool CreateDesktopShortcut(string url, string customIconPath)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return false;

                dynamic shell = Activator.CreateInstance(shellType);
                string desktopFolder = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string shortcutPath = Path.Combine(desktopFolder, "4Rent Management System.lnk");

                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                string browser = FindBrowserExecutable();

                if (!string.IsNullOrEmpty(browser))
                {
                    shortcut.TargetPath = browser;
                    shortcut.Arguments = "--app=\"" + url + "\" --start-maximized";
                }
                else
                {
                    shortcut.TargetPath = url;
                }

                if (!string.IsNullOrEmpty(customIconPath) && File.Exists(customIconPath))
                {
                    shortcut.IconLocation = customIconPath + ",0";
                }
                else if (!string.IsNullOrEmpty(browser))
                {
                    shortcut.IconLocation = browser + ",0";
                }

                shortcut.Description = "4Rent Management System - Full Screen Standalone Desktop";
                shortcut.Save();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void OnLaunchClicked(object sender, EventArgs e)
        {
            string url = GetTargetAppUrl();
            lblStatus.Text = "Status: Launching standalone desktop window...";
            lblStatus.ForeColor = Color.FromArgb(245, 158, 11);

            // Also create / update desktop shortcut automatically
            CreateDesktopShortcut(url, iconPath);

            bool ok = LaunchApp(url);
            if (ok)
            {
                lblStatus.Text = "Status: 4Rent Desktop is running!";
                lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                Timer t = new Timer();
                t.Interval = 1200;
                t.Tick += (ts, te) =>
                {
                    t.Stop();
                    this.Close();
                };
                t.Start();
            }
            else
            {
                lblStatus.Text = "Status: Failed to open browser window.";
                lblStatus.ForeColor = Color.FromArgb(248, 113, 113);
            }
        }

        private void OnCreateShortcutClicked(object sender, EventArgs e)
        {
            string url = GetTargetAppUrl();
            bool ok = CreateDesktopShortcut(url, iconPath);
            if (ok)
            {
                lblStatus.Text = "Status: ✓ Shortcut '4Rent Management System' created on Desktop!";
                lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                MessageBox.Show(
                    "Official Desktop Shortcut created successfully on your Windows Desktop!\r\n\r\nYou can now launch 4Rent directly from your desktop anytime with the 4Rent system logo.",
                    "4Rent Management System",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            else
            {
                lblStatus.Text = "Status: Could not create desktop shortcut.";
                lblStatus.ForeColor = Color.FromArgb(248, 113, 113);
            }
        }
    }

    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string icoCandidate1 = Path.Combine(exeDir, "4rent-icon.ico");
            string icoCandidate2 = Path.Combine(exeDir, "..\\..\\public\\4rent-icon.ico");
            string icoCandidate3 = Path.Combine(exeDir, "public\\4rent-icon.ico");

            string iconPath = File.Exists(icoCandidate1)
                ? Path.GetFullPath(icoCandidate1)
                : (File.Exists(icoCandidate2) ? Path.GetFullPath(icoCandidate2) : Path.GetFullPath(icoCandidate3));

            if (args != null && args.Length > 0)
            {
                string arg0 = args[0].ToLowerInvariant();
                if (arg0 == "/silent" || arg0 == "--silent" || arg0 == "/launch" || arg0 == "--launch")
                {
                    string prop = (args.Length > 1 && !string.IsNullOrEmpty(args[1])) ? args[1] : "4RENT-MAIN";
                    string url = "https://splikaa.github.io/4Rent/?desktop=1&prop=" + Uri.EscapeDataString(prop);
                    LauncherForm.CreateDesktopShortcut(url, iconPath);
                    LauncherForm.LaunchApp(url);
                    return;
                }
            }

            Application.Run(new LauncherForm(iconPath));
        }
    }
}
