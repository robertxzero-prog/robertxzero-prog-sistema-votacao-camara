export class LoginDto {
  email!: string;
  senha!: string;
  twoFactorCode?: string;
  deviceId?: string;
  deviceName?: string;
}
