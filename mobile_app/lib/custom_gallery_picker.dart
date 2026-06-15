import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;
import 'dart:convert';
import 'dart:io';

class SelectedPhoto {
  final AssetEntity? entity;
  final File? file;
  SelectedPhoto({this.entity, this.file});

  Future<File?> get getFile async {
    if (file != null) return file;
    return await entity?.file;
  }
}

class CustomGalleryPicker extends StatefulWidget {
  final int maxCount;
  const CustomGalleryPicker({super.key, this.maxCount = 10});

  @override
  State<CustomGalleryPicker> createState() => _CustomGalleryPickerState();
}

class _CustomGalleryPickerState extends State<CustomGalleryPicker> {
  List<AssetEntity> _assets = [];
  final List<SelectedPhoto> _selectedPhotos = [];
  
  // 백그라운드 선업로드(Pre-uploading)를 위한 맵핑 객체들
  final Map<String, String> _uploadedUrls = {}; 
  final Map<String, Future<void>> _uploadFutures = {};

  AssetEntity? _previewAsset;
  File? _previewFile;
  
  bool _isLoading = false;
  bool _isUploading = false;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _requestPermissionAndLoadPhotos();
  }

  Future<void> _requestPermissionAndLoadPhotos() async {
    setState(() => _isLoading = true);
    
    // photo_manager 권한 허용 여부 확인
    final PermissionState ps = await PhotoManager.requestPermissionExtend();
    bool isAuthorized = ps.isAuth;
    
    if (!isAuthorized && Platform.isAndroid) {
      final photosStatus = await Permission.photos.status;
      final storageStatus = await Permission.storage.status;
      if (photosStatus.isGranted || storageStatus.isGranted) {
        isAuthorized = true;
      }
    }

    if (isAuthorized) {
      // 앨범 목록 조회
      List<AssetPathEntity> albums = await PhotoManager.getAssetPathList(
        type: RequestType.image,
      );
      if (albums.isNotEmpty) {
        // 최근 사진 150장 로드
        List<AssetEntity> assets = await albums[0].getAssetListRange(
          start: 0,
          end: 150,
        );
        setState(() {
          _assets = assets;
          if (assets.isNotEmpty) {
            _previewAsset = assets[0];
          }
        });
      }
    } else {
      // 권한 거부 시 안내 및 시스템 설정 열기
      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text("권한 필요"),
            content: const Text("사진첩 접근 권한이 거부되었습니다. 설정에서 허용해 주세요."),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  PhotoManager.openSetting();
                },
                child: const Text("설정 열기"),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text("취소"),
              ),
            ],
          ),
        );
      }
    }
    setState(() => _isLoading = false);
  }

  // Dart image 패키지를 활용한 90% 이상 고용량 압축 기능 구현 (최대 1200px, 80% 퀄리티)
  Future<File> _compressImage(File file) async {
    try {
      final bytes = await file.readAsBytes();
      final image = img.decodeImage(bytes);
      if (image == null) return file;

      img.Image resized = image;
      if (image.width > 1200 || image.height > 1200) {
        if (image.width > image.height) {
          resized = img.copyResize(image, width: 1200);
        } else {
          resized = img.copyResize(image, height: 1200);
        }
      }

      final compressedBytes = img.encodeJpg(resized, quality: 80);

      final tempDir = Directory.systemTemp;
      final tempFile = File(
          '${tempDir.path}/compressed_${DateTime.now().millisecondsSinceEpoch}.jpg');
      await tempFile.writeAsBytes(compressedBytes);
      return tempFile;
    } catch (e) {
      debugPrint("이미지 압축 실패: $e");
      return file;
    }
  }

  String _getPhotoKey(SelectedPhoto photo) {
    if (photo.entity != null) return photo.entity!.id;
    return photo.file!.path;
  }

  // 사진을 선택 또는 촬영하는 순간 즉시 압축 및 R2 서버로 선업로드(Pre-uploading) 시작
  Future<void> _compressAndUploadPhoto(SelectedPhoto photo) async {
    final key = _getPhotoKey(photo);
    try {
      File? originalFile = await photo.getFile;
      if (originalFile == null) return;
      
      // 1. 이미지 압축
      File compressedFile = await _compressImage(originalFile);
      
      // 2. R2로 업로드
      var request = http.MultipartRequest(
        'POST',
        Uri.parse('https://myplating.kr/upload'),
      );
      request.files.add(await http.MultipartFile.fromPath('file', compressedFile.path));

      var streamedResponse = await request.send();
      var response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        var data = jsonDecode(response.body);
        if (data['success'] == true) {
          _uploadedUrls[key] = data['url'];
          debugPrint("선업로드 성공: $key -> ${data['url']}");
        }
      }
    } catch (e) {
      debugPrint("선업로드 실패: $e");
    }
  }

  Future<void> _handleCamera() async {
    final XFile? photo = await _picker.pickImage(source: ImageSource.camera);
    if (photo != null) {
      final file = File(photo.path);
      final selected = SelectedPhoto(file: file);
      final key = file.path;
      
      setState(() {
        if (_selectedPhotos.length < widget.maxCount) {
          _selectedPhotos.add(selected);
          _previewFile = file;
          _previewAsset = null;
          
          // 촬영하자마자 백그라운드 선업로드 기동
          _uploadFutures[key] = _compressAndUploadPhoto(selected);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("사진은 최대 ${widget.maxCount}장까지 선택 가능합니다.")),
          );
        }
      });
    }
  }

  void _toggleSelection(AssetEntity asset) {
    final key = asset.id;
    int index = _selectedPhotos.indexWhere((p) => p.entity?.id == key);
    setState(() {
      if (index >= 0) {
        // 이미 선택된 경우 제거
        _selectedPhotos.removeAt(index);
        _uploadedUrls.remove(key);
        _uploadFutures.remove(key);
        if (_selectedPhotos.isNotEmpty) {
          final last = _selectedPhotos.last;
          _previewAsset = last.entity;
          _previewFile = last.file;
        }
      } else {
        // 새로 선택하는 경우
        if (_selectedPhotos.length < widget.maxCount) {
          final selected = SelectedPhoto(entity: asset);
          _selectedPhotos.add(selected);
          _previewAsset = asset;
          _previewFile = null;
          
          // 터치 즉시 백그라운드 선업로드 기동
          _uploadFutures[key] = _compressAndUploadPhoto(selected);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("사진은 최대 ${widget.maxCount}장까지 선택 가능합니다.")),
          );
        }
      }
    });
  }

  int _getSelectedIndex(AssetEntity asset) {
    return _selectedPhotos.indexWhere((p) => p.entity?.id == asset.id);
  }

  Future<void> _uploadAndReturn() async {
    if (_selectedPhotos.isEmpty) return;

    setState(() => _isUploading = true);
    
    // 업로드 마무리 로딩 모달 표출
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(color: Colors.black),
              SizedBox(width: 20),
              Text("사진 업로드를 완료하는 중입니다..."),
            ],
          ),
        ),
      ),
    );

    // 모든 선택 항목의 비동기 업로드 Future들을 수집하여 대기
    List<Future<void>> futures = [];
    for (var photo in _selectedPhotos) {
      final key = _getPhotoKey(photo);
      final f = _uploadFutures[key];
      if (f != null) {
        futures.add(f);
      }
    }
    
    await Future.wait(futures);

    // 사진첩 선택 순서에 완벽히 정렬하여 R2 URL들을 파싱
    List<String> urls = [];
    for (var photo in _selectedPhotos) {
      final key = _getPhotoKey(photo);
      final url = _uploadedUrls[key];
      if (url != null) {
        urls.add(url);
      }
    }

    if (mounted) {
      Navigator.pop(context); // 로딩 창 닫기
    }

    setState(() => _isUploading = false);

    if (mounted) {
      Navigator.pop(context, urls); // 결과 반환하며 갤러리 피커 닫기
    }
  }

  @override
  Widget build(BuildContext context) {
    // 트렌디하고 고급스러운 다크 그레이 디자인 테마
    const darkBackgroundColor = Color(0xFF0F0F10);
    const darkCardColor = Color(0xFF18181C);

    return Scaffold(
      backgroundColor: darkBackgroundColor,
      appBar: AppBar(
        backgroundColor: darkBackgroundColor,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              "최근 항목",
              style: TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(width: 4),
            Icon(Icons.keyboard_arrow_down, color: Colors.white, size: 18),
          ],
        ),
        centerTitle: true,
        actions: [
          // 파란색 캡슐 디자인의 트렌디한 다음 버튼
          Padding(
            padding: const EdgeInsets.only(right: 12, top: 10, bottom: 10),
            child: ElevatedButton(
              onPressed: (_selectedPhotos.isEmpty || _isUploading) ? null : _uploadAndReturn,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue[600],
                disabledBackgroundColor: Colors.grey[800],
                foregroundColor: Colors.white,
                disabledForegroundColor: Colors.grey[400],
                elevation: 0,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
              child: const Text(
                "다음",
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // 상단 사진 크게 보기 영역
          Container(
            height: MediaQuery.of(context).size.height * 0.38,
            width: double.infinity,
            color: Colors.black,
            child: _previewFile != null
                ? Image.file(_previewFile!, fit: BoxFit.cover)
                : (_previewAsset != null
                    ? FutureBuilder<File?>(
                        future: _previewAsset!.file,
                        builder: (context, snapshot) {
                          if (snapshot.connectionState == ConnectionState.done && snapshot.data != null) {
                            return Image.file(snapshot.data!, fit: BoxFit.cover);
                          }
                          return const Center(child: CircularProgressIndicator(color: Colors.white24));
                        },
                      )
                    : const Center(
                        child: Text(
                          "사진을 선택해 주세요",
                          style: TextStyle(color: Colors.white30, fontSize: 13),
                        ),
                      )),
          ),
          
          // 하단 그리드 영역
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Colors.white24))
                : GridView.builder(
                    padding: const EdgeInsets.all(1),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      crossAxisSpacing: 1.5,
                      mainAxisSpacing: 1.5,
                    ),
                    itemCount: _assets.length + 1, // 카메라 타일 1개 추가
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        // 0번 타일: 촬영하기 (어두운 카드 디자인)
                        return GestureDetector(
                          onTap: _handleCamera,
                          child: Container(
                            color: darkCardColor,
                            child: const Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.camera_alt_outlined, color: Colors.white, size: 28),
                                SizedBox(height: 5),
                                Text(
                                  "촬영하기",
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.white70,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }

                      // 갤러리 미디어 타일
                      final asset = _assets[index - 1];
                      final selIdx = _getSelectedIndex(asset);
                      final isSelected = selIdx >= 0;

                      return GestureDetector(
                        onTap: () => _toggleSelection(asset),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            // FutureBuilder를 이용한 썸네일 렌더링
                            FutureBuilder<Uint8List?>(
                              future: asset.thumbnailData,
                              builder: (context, snapshot) {
                                final bytes = snapshot.data;
                                if (bytes == null) {
                                  return Container(color: darkCardColor);
                                }
                                return Image.memory(bytes, fit: BoxFit.cover);
                              },
                            ),
                            
                            // 선택 시 반투명 블랙 레이어 및 크기 변화 효과 부여
                            if (isSelected)
                              Container(
                                color: Colors.black.withOpacity(0.35),
                                child: Container(
                                  margin: const EdgeInsets.all(4),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: Colors.blue[500]!, width: 2),
                                  ),
                                ),
                              ),
                            
                            // 우상단 체크/순서 동그라미 배지
                            Positioned(
                              top: 8,
                              right: 8,
                              child: Container(
                                width: 20,
                                height: 20,
                                decoration: BoxDecoration(
                                  color: isSelected ? Colors.blue[600] : Colors.black.withOpacity(0.4),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 1.5),
                                ),
                                child: Center(
                                  child: isSelected
                                      ? Text(
                                          "${selIdx + 1}",
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 10,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        )
                                      : null,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
