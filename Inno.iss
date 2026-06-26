; Script for Truvon Enterprises - ERPMED
#define MyAppName "Truvon Medical Billing"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "Truvon Enterprises"
#define MyAppExeName "launcher.exe"

[Setup]
AppId={{2AC7CBF3-B53D-492C-B4E9-FA47E5F5A2A8}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoCompany={#MyAppPublisher}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppPublisher}\ERPMED
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
InfoBeforeFile=INSTALL_WELCOME.txt
OutputDir=installer_output
OutputBaseFilename=Truvon_ERPMED_v1.2.0_Setup
SetupIconFile=iconfile\erp_11891097.ico
LicenseFile=license.txt
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "admin_mode"; Description: "Install as Administrator (Bootstraps initial local account)"; GroupDescription: "User Role:"; Flags: exclusive
Name: "staff_mode"; Description: "Install as Staff (Syncs user list from Cloud on startup)"; GroupDescription: "User Role:"; Flags: exclusive unchecked

[Files]
Source: "build_nuitka\launcher.dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "iconfile\erp_11891097.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\erp_11891097.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\erp_11891097.ico"

[Code]
// Import Windows function to check internet connection
function InternetCheckConnection(lpszUrl: String; dwFlags: DWord; dwReserved: DWord): BOOL;
external 'InternetCheckConnectionW@wininet.dll stdcall';

function InitializeSetup(): Boolean;
begin
  Result := True;
  
  // Check for internet connection (8.8.8.8 or google.com)
  // Flag 1 = FLAG_ICC_FORCE_CONNECTION
  if not InternetCheckConnection('http://www.google.com', 1, 0) then
  begin
    MsgBox('No internet connection detected.' #13#13 'This application requires an active internet connection during installation to verify cloud services and sync initial data.' #13#13 'Please connect to the internet and run the installer again.', mbCriticalError, MB_OK);
    Result := False;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{localappdata}\.truvon_enterprises');
    if DirExists(DataDir) then
    begin
      if MsgBox('Do you want to delete all local application data, including databases and logs?' #13#13 'Note: This action cannot be undone.', mbConfirmation, MB_YESNO) = IDYES then
      begin
        DelTree(DataDir, True, True, True);
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ModeDir: String;
  ModeFile: String;
  ModeValue: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Use Local AppData for mode setting
    ModeDir := ExpandConstant('{localappdata}\.truvon_enterprises');
    ModeFile := ModeDir + '\mode.txt';
    
    if not ForceDirectories(ModeDir) then
    begin
      exit;
    end;

    if WizardIsTaskSelected('staff_mode') then
      ModeValue := 'staff'
    else
      ModeValue := 'admin';

    SaveStringToFile(ModeFile, ModeValue, False);
  end;
end;

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
