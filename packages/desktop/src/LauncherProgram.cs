using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
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
        private Button btnOpenApk;
        private Button btnOpenWeb;
        private string iconPath;

        public LauncherForm(string icoPath)
        {
            this.iconPath = icoPath;
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "4Rent Management System — Official Desktop Launcher";
            this.ClientSize = new Size(620, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(9, 13, 20);
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

            // ================= HEADER PANEL =================
            Panel pnlHeader = new Panel();
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Size = new Size(620, 105);
            pnlHeader.BackColor = Color.FromArgb(16, 22, 34);
            this.Controls.Add(pnlHeader);

            // 4R Brand Badge
            Label lblBadge = new Label();
            lblBadge.Text = "4R";
            lblBadge.Font = new Font("Segoe UI Black", 20f, FontStyle.Bold);
            lblBadge.ForeColor = Color.FromArgb(245, 158, 11);
            lblBadge.BackColor = Color.FromArgb(10, 14, 22);
            lblBadge.TextAlign = ContentAlignment.MiddleCenter;
            lblBadge.Location = new Point(22, 20);
            lblBadge.Size = new Size(64, 64);
            lblBadge.BorderStyle = BorderStyle.FixedSingle;
            pnlHeader.Controls.Add(lblBadge);

            // Title
            Label lblTitle = new Label();
            lblTitle.Text = "4Rent Management System";
            lblTitle.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(98, 18);
            lblTitle.AutoSize = true;
            pnlHeader.Controls.Add(lblTitle);

            // Subtitle
            Label lblSub = new Label();
            lblSub.Text = "Standalone Desktop Client • Chromium App Host v1.1.0";
            lblSub.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
            lblSub.ForeColor = Color.FromArgb(148, 163, 184);
            lblSub.Location = new Point(100, 48);
            lblSub.AutoSize = true;
            pnlHeader.Controls.Add(lblSub);

            // Live Engine Status Pill
            Label lblEngineStatus = new Label();
            string detectedBrowser = FindBrowserName();
            lblEngineStatus.Text = "● Engine Ready (" + detectedBrowser + ")";
            lblEngineStatus.Font = new Font("Segoe UI", 8f, FontStyle.Bold);
            lblEngineStatus.ForeColor = Color.FromArgb(52, 211, 153);
            lblEngineStatus.BackColor = Color.FromArgb(6, 78, 59);
            lblEngineStatus.TextAlign = ContentAlignment.MiddleCenter;
            lblEngineStatus.Location = new Point(100, 72);
            lblEngineStatus.Size = new Size(210, 20);
            pnlHeader.Controls.Add(lblEngineStatus);

            // Amber Accent Divider Line
            Panel pnlLine = new Panel();
            pnlLine.Location = new Point(0, 104);
            pnlLine.Size = new Size(620, 2);
            pnlLine.BackColor = Color.FromArgb(245, 158, 11);
            this.Controls.Add(pnlLine);

            // ================= 3 FEATURE CARDS (REPLACING PLAIN TEXTBOX) =================
            Label lblFeaturesHeader = new Label();
            lblFeaturesHeader.Text = "SYSTEM ARCHITECTURE & CAPABILITIES";
            lblFeaturesHeader.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lblFeaturesHeader.ForeColor = Color.FromArgb(245, 158, 11);
            lblFeaturesHeader.Location = new Point(24, 120);
            lblFeaturesHeader.AutoSize = true;
            this.Controls.Add(lblFeaturesHeader);

            int cardY = 142;
            int cardH = 50;
            int cardW = 572;

            // Card 1: Standalone Desktop Window
            Panel card1 = CreateFeatureCard(
                24, cardY, cardW, cardH,
                "🖥️   Standalone Window Mode",
                "Full-screen dedicated client powered by Microsoft Edge / Chrome. Zero browser address bars or tabs."
            );
            this.Controls.Add(card1);

            // Card 2: Sub-Meter OCR & Real-time Green Viewfinder
            Panel card2 = CreateFeatureCard(
                24, cardY + 58, cardW, cardH,
                "⚡   Sub-Meter OCR & Bill Engine",
                "Real-time cyclometer register detection with emerald green viewfinder lock and direct Messenger forwarding."
            );
            this.Controls.Add(card2);

            // Card 3: Multi-User Property Code Partition
            Panel card3 = CreateFeatureCard(
                24, cardY + 116, cardW, cardH,
                "🔒   Multi-Landlord Data Partitioning",
                "Tenant and billing records are isolated by Property Code. Seamlessly syncs between Windows PC and Mobile APK."
            );
            this.Controls.Add(card3);

            // ================= PROPERTY SPACE CODE CONFIG =================
            int propY = 320;
            Label lblPropCode = new Label();
            lblPropCode.Text = "Property Space Code (Multi-User Partition):";
            lblPropCode.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            lblPropCode.ForeColor = Color.FromArgb(203, 213, 225);
            lblPropCode.Location = new Point(24, propY);
            lblPropCode.AutoSize = true;
            this.Controls.Add(lblPropCode);

            txtPropertyCode = new TextBox();
            txtPropertyCode.Text = "4RENT-MAIN";
            txtPropertyCode.Font = new Font("Consolas", 11.5f, FontStyle.Bold);
            txtPropertyCode.BackColor = Color.FromArgb(20, 27, 41);
            txtPropertyCode.ForeColor = Color.FromArgb(245, 158, 11);
            txtPropertyCode.BorderStyle = BorderStyle.FixedSingle;
            txtPropertyCode.Location = new Point(24, propY + 22);
            txtPropertyCode.Size = new Size(260, 29);
            this.Controls.Add(txtPropertyCode);

            Label lblPropHint = new Label();
            lblPropHint.Text = "Default: 4RENT-MAIN (Share this code to sync your phone APK & PC)";
            lblPropHint.Font = new Font("Segoe UI", 8f, FontStyle.Italic);
            lblPropHint.ForeColor = Color.FromArgb(148, 163, 184);
            lblPropHint.Location = new Point(292, propY + 28);
            lblPropHint.AutoSize = true;
            this.Controls.Add(lblPropHint);

            // ================= PRIMARY ACTION BUTTONS =================
            int btnY = 385;

            // Hero Launch Button (Vibrant Amber)
            btnLaunch = new Button();
            btnLaunch.Text = "▶   LAUNCH 4RENT STANDALONE DESKTOP APP";
            btnLaunch.Font = new Font("Segoe UI", 11f, FontStyle.Bold);
            btnLaunch.BackColor = Color.FromArgb(245, 158, 11);
            btnLaunch.ForeColor = Color.FromArgb(10, 14, 22);
            btnLaunch.FlatStyle = FlatStyle.Flat;
            btnLaunch.FlatAppearance.BorderSize = 0;
            btnLaunch.Location = new Point(24, btnY);
            btnLaunch.Size = new Size(572, 50);
            btnLaunch.Cursor = Cursors.Hand;
            btnLaunch.Click += new EventHandler(OnLaunchClicked);
            this.Controls.Add(btnLaunch);

            // Secondary Pin Shortcut Button
            btnCreateShortcut = new Button();
            btnCreateShortcut.Text = "📌   Pin 4Rent to Windows Desktop (with Official System Icon)";
            btnCreateShortcut.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnCreateShortcut.BackColor = Color.FromArgb(22, 31, 48);
            btnCreateShortcut.ForeColor = Color.FromArgb(226, 232, 240);
            btnCreateShortcut.FlatStyle = FlatStyle.Flat;
            btnCreateShortcut.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnCreateShortcut.Location = new Point(24, btnY + 58);
            btnCreateShortcut.Size = new Size(572, 40);
            btnCreateShortcut.Cursor = Cursors.Hand;
            btnCreateShortcut.Click += new EventHandler(OnCreateShortcutClicked);
            this.Controls.Add(btnCreateShortcut);

            // Direct Package Download / Explore Row
            int row3Y = btnY + 106;
            btnOpenApk = new Button();
            btnOpenApk.Text = "📱   Android Release APK (Install / Share)";
            btnOpenApk.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            btnOpenApk.BackColor = Color.FromArgb(16, 24, 38);
            btnOpenApk.ForeColor = Color.FromArgb(52, 211, 153);
            btnOpenApk.FlatStyle = FlatStyle.Flat;
            btnOpenApk.FlatAppearance.BorderColor = Color.FromArgb(16, 185, 129);
            btnOpenApk.Location = new Point(24, row3Y);
            btnOpenApk.Size = new Size(280, 36);
            btnOpenApk.Cursor = Cursors.Hand;
            btnOpenApk.Click += new EventHandler(OnOpenApkClicked);
            this.Controls.Add(btnOpenApk);

            btnOpenWeb = new Button();
            btnOpenWeb.Text = "🌐   Open Web App (splikaa.github.io/4Rent)";
            btnOpenWeb.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            btnOpenWeb.BackColor = Color.FromArgb(16, 24, 38);
            btnOpenWeb.ForeColor = Color.FromArgb(96, 165, 250);
            btnOpenWeb.FlatStyle = FlatStyle.Flat;
            btnOpenWeb.FlatAppearance.BorderColor = Color.FromArgb(59, 130, 246);
            btnOpenWeb.Location = new Point(316, row3Y);
            btnOpenWeb.Size = new Size(280, 36);
            btnOpenWeb.Cursor = Cursors.Hand;
            btnOpenWeb.Click += new EventHandler(OnOpenWebClicked);
            this.Controls.Add(btnOpenWeb);

            // ================= STATUS & FOOTER =================
            Panel pnlFooter = new Panel();
            pnlFooter.Location = new Point(0, 620);
            pnlFooter.Size = new Size(620, 60);
            pnlFooter.BackColor = Color.FromArgb(14, 19, 30);
            this.Controls.Add(pnlFooter);

            lblStatus = new Label();
            lblStatus.Text = "Status: Ready • Zero installation required • Portable Edition";
            lblStatus.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(148, 163, 184);
            lblStatus.Location = new Point(24, 18);
            lblStatus.AutoSize = true;
            pnlFooter.Controls.Add(lblStatus);

            Button btnExit = new Button();
            btnExit.Text = "Exit";
            btnExit.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            btnExit.BackColor = Color.FromArgb(20, 27, 41);
            btnExit.ForeColor = Color.FromArgb(148, 163, 184);
            btnExit.FlatStyle = FlatStyle.Flat;
            btnExit.FlatAppearance.BorderColor = Color.FromArgb(30, 41, 59);
            btnExit.Location = new Point(526, 14);
            btnExit.Size = new Size(70, 30);
            btnExit.Cursor = Cursors.Hand;
            btnExit.Click += (s, e) => this.Close();
            pnlFooter.Controls.Add(btnExit);
        }

        private Panel CreateFeatureCard(int x, int y, int w, int h, string title, string description)
        {
            Panel card = new Panel();
            card.Location = new Point(x, y);
            card.Size = new Size(w, h);
            card.BackColor = Color.FromArgb(15, 21, 33);
            card.BorderStyle = BorderStyle.FixedSingle;

            Label lblTitle = new Label();
            lblTitle.Text = title;
            lblTitle.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(245, 158, 11);
            lblTitle.Location = new Point(10, 6);
            lblTitle.AutoSize = true;
            card.Controls.Add(lblTitle);

            Label lblDesc = new Label();
            lblDesc.Text = description;
            lblDesc.Font = new Font("Segoe UI", 8f, FontStyle.Regular);
            lblDesc.ForeColor = Color.FromArgb(203, 213, 225);
            lblDesc.Location = new Point(12, 26);
            lblDesc.AutoSize = true;
            card.Controls.Add(lblDesc);

            return card;
        }

        private string GetTargetAppUrl()
        {
            string code = (txtPropertyCode != null && !string.IsNullOrEmpty(txtPropertyCode.Text))
                ? txtPropertyCode.Text.Trim()
                : "4RENT-MAIN";
            return "https://splikaa.github.io/4Rent/?desktop=1&prop=" + Uri.EscapeDataString(code);
        }

        private static string FindBrowserName()
        {
            string browser = FindBrowserExecutable();
            if (string.IsNullOrEmpty(browser)) return "Default Browser";
            if (browser.ToLowerInvariant().Contains("edge")) return "Microsoft Edge";
            if (browser.ToLowerInvariant().Contains("chrome")) return "Google Chrome";
            return "Chromium Engine";
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

            // Create desktop shortcut automatically on launch
            CreateDesktopShortcut(url, iconPath);

            bool ok = LaunchApp(url);
            if (ok)
            {
                lblStatus.Text = "Status: ✓ 4Rent Desktop is running!";
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

        private void OnOpenApkClicked(object sender, EventArgs e)
        {
            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string candidate1 = Path.Combine(exeDir, "..\\mobile\\4Rent-v1.0.0-release.apk");
                string candidate2 = Path.Combine(exeDir, "packages\\mobile\\4Rent-v1.0.0-release.apk");
                string candidate3 = Path.Combine(exeDir, "4Rent-v1.0.0-release.apk");

                string target = File.Exists(candidate1) ? candidate1 : (File.Exists(candidate2) ? candidate2 : candidate3);
                if (File.Exists(target))
                {
                    Process.Start("explorer.exe", "/select,\"" + Path.GetFullPath(target) + "\"");
                    lblStatus.Text = "Status: Opened folder with 4Rent Android APK!";
                    lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                }
                else
                {
                    Process.Start("https://splikaa.github.io/4Rent/4Rent-v1.0.0-release.apk");
                    lblStatus.Text = "Status: Opened online Android APK direct download link.";
                    lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                }
            }
            catch (Exception ex)
            {
                lblStatus.Text = "Status: " + ex.Message;
            }
        }

        private void OnOpenWebClicked(object sender, EventArgs e)
        {
            try
            {
                Process.Start("https://splikaa.github.io/4Rent/");
                lblStatus.Text = "Status: Opened 4Rent Web Application in default browser.";
                lblStatus.ForeColor = Color.FromArgb(96, 165, 250);
            }
            catch (Exception ex)
            {
                lblStatus.Text = "Status: " + ex.Message;
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
