using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

[assembly: AssemblyTitle("4Rent Management System")]
[assembly: AssemblyDescription("Official Desktop Launcher & Standalone Client for 4Rent")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("4Rent Systems")]
[assembly: AssemblyProduct("4Rent Management System")]
[assembly: AssemblyCopyright("Copyright © 2026 4Rent Systems. All rights reserved.")]
[assembly: AssemblyTrademark("4Rent")]
[assembly: AssemblyCulture("")]
[assembly: ComVisible(false)]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

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
            this.ClientSize = new Size(680, 712);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(11, 15, 23); // Deep Obsidian Black
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

            // ================= 1. HEADER PANEL =================
            Panel pnlHeader = new Panel();
            pnlHeader.Location = new Point(0, 0);
            pnlHeader.Size = new Size(680, 105);
            pnlHeader.BackColor = Color.FromArgb(17, 24, 38);
            this.Controls.Add(pnlHeader);

            // 4R Brand Badge
            Label lblBadge = new Label();
            lblBadge.Text = "4R";
            lblBadge.Font = new Font("Segoe UI Black", 22f, FontStyle.Bold);
            lblBadge.ForeColor = Color.FromArgb(245, 158, 11);
            lblBadge.BackColor = Color.FromArgb(11, 15, 24);
            lblBadge.TextAlign = ContentAlignment.MiddleCenter;
            lblBadge.Location = new Point(30, 18);
            lblBadge.Size = new Size(68, 68);
            lblBadge.BorderStyle = BorderStyle.FixedSingle;
            pnlHeader.Controls.Add(lblBadge);

            // Title
            Label lblTitle = new Label();
            lblTitle.Text = "4Rent Management System";
            lblTitle.UseMnemonic = false;
            lblTitle.Font = new Font("Segoe UI", 16.5f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(112, 16);
            lblTitle.AutoSize = true;
            pnlHeader.Controls.Add(lblTitle);

            // Subtitle
            Label lblSub = new Label();
            lblSub.Text = "Standalone Desktop Host • Chromium Client v1.1.0";
            lblSub.UseMnemonic = false;
            lblSub.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
            lblSub.ForeColor = Color.FromArgb(148, 163, 184);
            lblSub.Location = new Point(114, 46);
            lblSub.AutoSize = true;
            pnlHeader.Controls.Add(lblSub);

            // Live Engine Status Pill
            Label lblEngineStatus = new Label();
            string detectedBrowser = FindBrowserName();
            lblEngineStatus.Text = "● Chromium Engine Active (" + detectedBrowser + ")";
            lblEngineStatus.UseMnemonic = false;
            lblEngineStatus.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lblEngineStatus.ForeColor = Color.FromArgb(52, 211, 153);
            lblEngineStatus.BackColor = Color.FromArgb(6, 78, 59);
            lblEngineStatus.TextAlign = ContentAlignment.MiddleCenter;
            lblEngineStatus.Location = new Point(114, 70);
            lblEngineStatus.Size = new Size(270, 22);
            lblEngineStatus.BorderStyle = BorderStyle.FixedSingle;
            pnlHeader.Controls.Add(lblEngineStatus);

            // Amber Accent Divider Line
            Panel pnlLine = new Panel();
            pnlLine.Location = new Point(0, 104);
            pnlLine.Size = new Size(680, 2);
            pnlLine.BackColor = Color.FromArgb(245, 158, 11);
            this.Controls.Add(pnlLine);

            // ================= 2. CAPABILITY CARDS =================
            Label lblFeaturesHeader = new Label();
            lblFeaturesHeader.Text = "SYSTEM ARCHITECTURE & CAPABILITIES";
            lblFeaturesHeader.UseMnemonic = false;
            lblFeaturesHeader.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lblFeaturesHeader.ForeColor = Color.FromArgb(245, 158, 11);
            lblFeaturesHeader.Location = new Point(30, 116);
            lblFeaturesHeader.AutoSize = true;
            this.Controls.Add(lblFeaturesHeader);

            int cardW = 620;
            int cardH = 68;

            // Card 1: Standalone Window Mode
            Panel card1 = CreateFeatureCard(
                30, 138, cardW, cardH,
                "Dedicated Standalone Window Mode",
                "[ NO BROWSER BARS ]",
                Color.FromArgb(245, 158, 11),
                "Runs in an isolated full-screen desktop window powered by Edge / Chrome. Zero address bars, tabs, or browser clutter."
            );
            this.Controls.Add(card1);

            // Card 2: Sub-Meter OCR & Bill Engine
            Panel card2 = CreateFeatureCard(
                30, 214, cardW, cardH,
                "Sub-Meter OCR & Real-Time Reticle Lock",
                "[ EMERALD LOCK ]",
                Color.FromArgb(52, 211, 153),
                "Real-time cyclometer register detection with emerald green viewfinder lock and direct 1-tap Messenger forwarding."
            );
            this.Controls.Add(card2);

            // Card 3: Multi-User Property Code Partition
            Panel card3 = CreateFeatureCard(
                30, 290, cardW, cardH,
                "Multi-Landlord Data Partitioning",
                "[ CLOUD SYNC ]",
                Color.FromArgb(96, 165, 250),
                "Tenant and billing records are isolated by Property Code. Seamlessly syncs between Windows PC and Android Mobile App."
            );
            this.Controls.Add(card3);

            // ================= 3. PROPERTY SPACE CODE CONFIG =================
            int propY = 368;
            Panel pnlPropBox = new Panel();
            pnlPropBox.Location = new Point(30, propY);
            pnlPropBox.Size = new Size(cardW, 50);
            pnlPropBox.BackColor = Color.FromArgb(17, 24, 38);
            pnlPropBox.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(pnlPropBox);

            Label lblPropPrefix = new Label();
            lblPropPrefix.Text = "PROPERTY CODE:";
            lblPropPrefix.UseMnemonic = false;
            lblPropPrefix.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lblPropPrefix.ForeColor = Color.FromArgb(245, 158, 11);
            lblPropPrefix.Location = new Point(12, 16);
            lblPropPrefix.AutoSize = true;
            pnlPropBox.Controls.Add(lblPropPrefix);

            txtPropertyCode = new TextBox();
            txtPropertyCode.Text = "4RENT-MAIN";
            txtPropertyCode.Font = new Font("Consolas", 12f, FontStyle.Bold);
            txtPropertyCode.BackColor = Color.FromArgb(23, 32, 51);
            txtPropertyCode.ForeColor = Color.FromArgb(251, 191, 36);
            txtPropertyCode.BorderStyle = BorderStyle.FixedSingle;
            txtPropertyCode.Location = new Point(135, 11);
            txtPropertyCode.Size = new Size(185, 26);
            pnlPropBox.Controls.Add(txtPropertyCode);

            Label lblPropSyncTag = new Label();
            lblPropSyncTag.Text = "● Synced with Android Mobile APK";
            lblPropSyncTag.UseMnemonic = false;
            lblPropSyncTag.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lblPropSyncTag.ForeColor = Color.FromArgb(52, 211, 153);
            lblPropSyncTag.Location = new Point(335, 16);
            lblPropSyncTag.AutoSize = true;
            pnlPropBox.Controls.Add(lblPropSyncTag);

            // ================= 4. PRIMARY ACTION BUTTONS =================
            int btnY = 428;

            // Hero Launch Button (Vibrant Amber with hover animation)
            btnLaunch = new Button();
            btnLaunch.Text = "►   LAUNCH 4RENT STANDALONE DESKTOP APP";
            btnLaunch.UseMnemonic = false;
            btnLaunch.Font = new Font("Segoe UI", 11.5f, FontStyle.Bold);
            btnLaunch.BackColor = Color.FromArgb(245, 158, 11);
            btnLaunch.ForeColor = Color.FromArgb(10, 14, 22);
            btnLaunch.FlatStyle = FlatStyle.Flat;
            btnLaunch.FlatAppearance.BorderSize = 0;
            btnLaunch.Location = new Point(30, btnY);
            btnLaunch.Size = new Size(cardW, 52);
            btnLaunch.Cursor = Cursors.Hand;
            btnLaunch.MouseEnter += (s, e) => btnLaunch.BackColor = Color.FromArgb(251, 191, 36);
            btnLaunch.MouseLeave += (s, e) => btnLaunch.BackColor = Color.FromArgb(245, 158, 11);
            btnLaunch.Click += new EventHandler(OnLaunchClicked);
            this.Controls.Add(btnLaunch);

            // Secondary Pin Shortcut Button
            btnCreateShortcut = new Button();
            btnCreateShortcut.Text = "📌   Pin 4Rent to Desktop & Taskbar (with Official Icon)";
            btnCreateShortcut.UseMnemonic = false;
            btnCreateShortcut.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnCreateShortcut.BackColor = Color.FromArgb(22, 31, 48);
            btnCreateShortcut.ForeColor = Color.FromArgb(226, 232, 240);
            btnCreateShortcut.FlatStyle = FlatStyle.Flat;
            btnCreateShortcut.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnCreateShortcut.Location = new Point(30, btnY + 60);
            btnCreateShortcut.Size = new Size(cardW, 40);
            btnCreateShortcut.Cursor = Cursors.Hand;
            btnCreateShortcut.MouseEnter += (s, e) => {
                btnCreateShortcut.BackColor = Color.FromArgb(30, 41, 59);
                btnCreateShortcut.FlatAppearance.BorderColor = Color.FromArgb(96, 165, 250);
            };
            btnCreateShortcut.MouseLeave += (s, e) => {
                btnCreateShortcut.BackColor = Color.FromArgb(22, 31, 48);
                btnCreateShortcut.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            };
            btnCreateShortcut.Click += new EventHandler(OnCreateShortcutClicked);
            this.Controls.Add(btnCreateShortcut);

            // Direct Package Download / Explore Row
            int row3Y = btnY + 108;
            int halfBtnW = 304;

            btnOpenApk = new Button();
            btnOpenApk.Text = "📱   Android Release APK (Install / Share)";
            btnOpenApk.UseMnemonic = false;
            btnOpenApk.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            btnOpenApk.BackColor = Color.FromArgb(16, 24, 38);
            btnOpenApk.ForeColor = Color.FromArgb(52, 211, 153);
            btnOpenApk.FlatStyle = FlatStyle.Flat;
            btnOpenApk.FlatAppearance.BorderColor = Color.FromArgb(16, 185, 129);
            btnOpenApk.Location = new Point(30, row3Y);
            btnOpenApk.Size = new Size(halfBtnW, 38);
            btnOpenApk.Cursor = Cursors.Hand;
            btnOpenApk.MouseEnter += (s, e) => {
                btnOpenApk.BackColor = Color.FromArgb(22, 36, 52);
                btnOpenApk.FlatAppearance.BorderColor = Color.FromArgb(52, 211, 153);
            };
            btnOpenApk.MouseLeave += (s, e) => {
                btnOpenApk.BackColor = Color.FromArgb(16, 24, 38);
                btnOpenApk.FlatAppearance.BorderColor = Color.FromArgb(16, 185, 129);
            };
            btnOpenApk.Click += new EventHandler(OnOpenApkClicked);
            this.Controls.Add(btnOpenApk);

            btnOpenWeb = new Button();
            btnOpenWeb.Text = "🌐   Open Web Application in Browser";
            btnOpenWeb.UseMnemonic = false;
            btnOpenWeb.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            btnOpenWeb.BackColor = Color.FromArgb(16, 24, 38);
            btnOpenWeb.ForeColor = Color.FromArgb(96, 165, 250);
            btnOpenWeb.FlatStyle = FlatStyle.Flat;
            btnOpenWeb.FlatAppearance.BorderColor = Color.FromArgb(59, 130, 246);
            btnOpenWeb.Location = new Point(346, row3Y);
            btnOpenWeb.Size = new Size(halfBtnW, 38);
            btnOpenWeb.Cursor = Cursors.Hand;
            btnOpenWeb.MouseEnter += (s, e) => {
                btnOpenWeb.BackColor = Color.FromArgb(22, 36, 52);
                btnOpenWeb.FlatAppearance.BorderColor = Color.FromArgb(96, 165, 250);
            };
            btnOpenWeb.MouseLeave += (s, e) => {
                btnOpenWeb.BackColor = Color.FromArgb(16, 24, 38);
                btnOpenWeb.FlatAppearance.BorderColor = Color.FromArgb(59, 130, 246);
            };
            btnOpenWeb.Click += new EventHandler(OnOpenWebClicked);
            this.Controls.Add(btnOpenWeb);

            // Package Specs Pill Bar
            Panel pnlSpecs = new Panel();
            pnlSpecs.Location = new Point(30, row3Y + 46);
            pnlSpecs.Size = new Size(cardW, 30);
            pnlSpecs.BackColor = Color.FromArgb(13, 18, 28);
            pnlSpecs.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(pnlSpecs);

            Label lblSpecs = new Label();
            lblSpecs.Text = "● Desktop Host: ~39 KB  •  Android APK: ~323 KB  •  Zero Installation Required";
            lblSpecs.UseMnemonic = false;
            lblSpecs.Font = new Font("Segoe UI", 8f, FontStyle.Bold);
            lblSpecs.ForeColor = Color.FromArgb(148, 163, 184);
            lblSpecs.TextAlign = ContentAlignment.MiddleCenter;
            lblSpecs.Dock = DockStyle.Fill;
            pnlSpecs.Controls.Add(lblSpecs);

            // ================= 5. STATUS & FOOTER =================
            Panel pnlFooter = new Panel();
            pnlFooter.Location = new Point(0, 642);
            pnlFooter.Size = new Size(680, 70);
            pnlFooter.BackColor = Color.FromArgb(14, 19, 30);
            pnlFooter.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(pnlFooter);

            lblStatus = new Label();
            lblStatus.Text = "Status: Ready • Zero installation required • Portable Edition";
            lblStatus.UseMnemonic = false;
            lblStatus.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(148, 163, 184);
            lblStatus.Location = new Point(30, 24);
            lblStatus.AutoSize = true;
            pnlFooter.Controls.Add(lblStatus);

            Button btnExit = new Button();
            btnExit.Text = "Exit";
            btnExit.UseMnemonic = false;
            btnExit.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            btnExit.BackColor = Color.FromArgb(20, 27, 41);
            btnExit.ForeColor = Color.FromArgb(148, 163, 184);
            btnExit.FlatStyle = FlatStyle.Flat;
            btnExit.FlatAppearance.BorderColor = Color.FromArgb(30, 41, 59);
            btnExit.Location = new Point(576, 18);
            btnExit.Size = new Size(74, 32);
            btnExit.Cursor = Cursors.Hand;
            btnExit.Click += (s, e) => this.Close();
            pnlFooter.Controls.Add(btnExit);
        }

        private Panel CreateFeatureCard(int x, int y, int w, int h, string title, string badgeText, Color badgeColor, string description)
        {
            Panel card = new Panel();
            card.Location = new Point(x, y);
            card.Size = new Size(w, h);
            card.BackColor = Color.FromArgb(17, 24, 38);
            card.BorderStyle = BorderStyle.FixedSingle;

            // Title
            Label lblTitle = new Label();
            lblTitle.Text = title;
            lblTitle.UseMnemonic = false;
            lblTitle.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(14, 10);
            lblTitle.AutoSize = true;
            card.Controls.Add(lblTitle);

            // Badge Pill
            Label lblBadge = new Label();
            lblBadge.Text = badgeText;
            lblBadge.UseMnemonic = false;
            lblBadge.Font = new Font("Segoe UI", 7.5f, FontStyle.Bold);
            lblBadge.ForeColor = badgeColor;
            lblBadge.BackColor = Color.FromArgb(24, 34, 53);
            lblBadge.TextAlign = ContentAlignment.MiddleCenter;
            lblBadge.Location = new Point(w - 170, 8);
            lblBadge.Size = new Size(155, 20);
            lblBadge.BorderStyle = BorderStyle.FixedSingle;
            card.Controls.Add(lblBadge);

            // Description (Wrapped with clean bounds to avoid any clipping)
            Label lblDesc = new Label();
            lblDesc.Text = description;
            lblDesc.UseMnemonic = false;
            lblDesc.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            lblDesc.ForeColor = Color.FromArgb(148, 163, 184);
            lblDesc.Location = new Point(14, 34);
            lblDesc.Size = new Size(w - 28, 30);
            lblDesc.AutoEllipsis = true;
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
                    psi.Arguments = "--app=\"" + url + "\" --start-maximized --window-state=maximized --new-window";
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
                string browser = FindBrowserExecutable();

                // 1. Desktop Shortcut
                string desktopFolder = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string desktopShortcutPath = Path.Combine(desktopFolder, "4Rent Management System.lnk");
                dynamic shortcut = shell.CreateShortcut(desktopShortcutPath);

                if (!string.IsNullOrEmpty(browser))
                {
                    shortcut.TargetPath = browser;
                    shortcut.Arguments = "--app=\"" + url + "\" --start-maximized --window-state=maximized --new-window";
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

                shortcut.WindowStyle = 3; // 3 = Maximized window on launch
                shortcut.Description = "4Rent Management System - Full Screen Standalone Desktop";
                shortcut.Save();

                // 2. Start Menu Programs Shortcut (Enables Windows "Pin to taskbar" indexing)
                try
                {
                    string programsFolder = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                    if (Directory.Exists(programsFolder))
                    {
                        string progShortcutPath = Path.Combine(programsFolder, "4Rent Management System.lnk");
                        dynamic progShortcut = shell.CreateShortcut(progShortcutPath);
                        if (!string.IsNullOrEmpty(browser))
                        {
                            progShortcut.TargetPath = browser;
                            progShortcut.Arguments = "--app=\"" + url + "\" --start-maximized --window-state=maximized --new-window";
                        }
                        else
                        {
                            progShortcut.TargetPath = url;
                        }

                        if (!string.IsNullOrEmpty(customIconPath) && File.Exists(customIconPath))
                        {
                            progShortcut.IconLocation = customIconPath + ",0";
                        }
                        else if (!string.IsNullOrEmpty(browser))
                        {
                            progShortcut.IconLocation = browser + ",0";
                        }

                        progShortcut.WindowStyle = 3;
                        progShortcut.Description = "4Rent Management System - Full Screen Standalone Desktop";
                        progShortcut.Save();
                    }
                }
                catch { }

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
                lblStatus.Text = "Status: ✓ Pinned to Desktop & Start Menu! Ready to pin to Taskbar.";
                lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                MessageBox.Show(
                    "✓ Official Shortcuts created on your Windows Desktop and Start Menu!\r\n\r\n📌 To Pin to Windows Taskbar:\r\n1. Right-click the '4Rent Management System' shortcut on your Desktop or Start Menu.\r\n2. Select 'Pin to taskbar'.\r\n\r\n4Rent will now launch directly in full-screen standalone mode with the official system icon!",
                    "4Rent Management System — Desktop & Taskbar Pinned",
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
                    lblStatus.Text = "Status: Selected 4Rent Android APK in folder!";
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
