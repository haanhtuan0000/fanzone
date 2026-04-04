import '../../core/l10n/app_strings.dart';

class _CountryInfo {
  final String nameVi;
  final String nameEn;
  final String flag;
  const _CountryInfo(this.nameVi, this.nameEn, this.flag);
}

const _countries = <String, _CountryInfo>{
  'VN': _CountryInfo('Việt Nam', 'Vietnam', '🇻🇳'),
  'KR': _CountryInfo('Hàn Quốc', 'South Korea', '🇰🇷'),
  'JP': _CountryInfo('Nhật Bản', 'Japan', '🇯🇵'),
  'TH': _CountryInfo('Thái Lan', 'Thailand', '🇹🇭'),
  'ID': _CountryInfo('Indonesia', 'Indonesia', '🇮🇩'),
  'MY': _CountryInfo('Malaysia', 'Malaysia', '🇲🇾'),
  'PH': _CountryInfo('Philippines', 'Philippines', '🇵🇭'),
  'CN': _CountryInfo('Trung Quốc', 'China', '🇨🇳'),
  'IN': _CountryInfo('Ấn Độ', 'India', '🇮🇳'),
  'US': _CountryInfo('Mỹ', 'United States', '🇺🇸'),
  'GB': _CountryInfo('Anh', 'United Kingdom', '🇬🇧'),
  'DE': _CountryInfo('Đức', 'Germany', '🇩🇪'),
  'FR': _CountryInfo('Pháp', 'France', '🇫🇷'),
  'ES': _CountryInfo('Tây Ban Nha', 'Spain', '🇪🇸'),
  'IT': _CountryInfo('Ý', 'Italy', '🇮🇹'),
  'BR': _CountryInfo('Brazil', 'Brazil', '🇧🇷'),
  'AR': _CountryInfo('Argentina', 'Argentina', '🇦🇷'),
  'PT': _CountryInfo('Bồ Đào Nha', 'Portugal', '🇵🇹'),
  'NL': _CountryInfo('Hà Lan', 'Netherlands', '🇳🇱'),
  'AU': _CountryInfo('Úc', 'Australia', '🇦🇺'),
};

String countryFlag(String? code) {
  if (code == null) return '🌍';
  return _countries[code.toUpperCase()]?.flag ?? '🌍';
}

String countryName(String? code) {
  if (code == null) return '';
  final info = _countries[code.toUpperCase()];
  if (info == null) return code;
  return identical(AppStrings.current, AppStrings.en) ? info.nameEn : info.nameVi;
}
