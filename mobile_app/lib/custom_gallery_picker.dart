import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
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
    if (ps.isAuth) {
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

  Future<void> _handleCamera() async {
    final XFile? photo = await _picker.pickImage(source: ImageSource.camera);
    if (photo != null) {
      final file = File(photo.path);
      final selected = SelectedPhoto(file: file);
      
      setState(() {
        if (_selectedPhotos.length < widget.maxCount) {
          _selectedPhotos.add(selected);
          _previewFile = file;
          _previewAsset = null;
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("사진은 최대 ${widget.maxCount}장까지 선택 가능합니다.")),
          );
        }
      });
    }
  }

  void _toggleSelection(AssetEntity asset) {
    int index = _selectedPhotos.indexWhere((p) => p.entity?.id == asset.id);
    setState(() {
      if (index >= 0) {
        // 이미 선택된 경우 제거
        _selectedPhotos.removeAt(index);
        if (_selectedPhotos.isNotEmpty) {
          final last = _selectedPhotos.last;
          _previewAsset = last.entity;
          _previewFile = last.file;
        }
      } else {
        // 새로 선택하는 경우
        if (_selectedPhotos.length < widget.maxCount) {
          _selectedPhotos.add(SelectedPhoto(entity: asset));
          _previewAsset = asset;
          _previewFile = null;
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
    
    // 로딩 모달 띄우기
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
              Text("사진을 업로드하는 중입니다..."),
            ],
          ),
        ),
      ),
    );

    List<String> uploadedUrls = [];
    
    try {
      for (var photo in _selectedPhotos) {
        File? file = await photo.getFile;
        if (file == null) continue;

        var request = http.MultipartRequest(
          'POST',
          Uri.parse('https://myplating.kr/upload'),
        );
        request.files.add(await http.MultipartFile.fromPath('file', file.path));

        var streamedResponse = await request.send();
        var response = await http.Response.fromStream(streamedResponse);

        if (response.statusCode == 200) {
          var data = jsonDecode(response.body);
          if (data['success'] == true) {
            uploadedUrls.add(data['url']);
          }
        }
      }
    } catch (e) {
      debugPrint("업로드 오류: $e");
    }

    // 로딩 다이얼로그 닫기
    if (mounted) {
      Navigator.pop(context);
    }

    setState(() => _isUploading = false);

    // 업로드 성공한 URL 리스트를 리턴하며 화면 닫기
    if (mounted) {
      Navigator.pop(context, uploadedUrls);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.black),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          "전체 보기",
          style: TextStyle(
            color: Colors.black,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        centerTitle: true,
        actions: [
          TextButton(
            onPressed: (_selectedPhotos.isEmpty || _isUploading) ? null : _uploadAndReturn,
            child: Text(
              "다음",
              style: TextStyle(
                color: _selectedPhotos.isEmpty ? Colors.grey : Colors.blue,
                fontWeight: FontWeight.bold,
                fontSize: 15,
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // 상단 사진 크게 보기 영역
          Container(
            height: MediaQuery.of(context).size.height * 0.4,
            width: double.infinity,
            color: Colors.grey[100],
            child: _previewFile != null
                ? Image.file(_previewFile!, fit: BoxFit.cover)
                : (_previewAsset != null
                    ? FutureBuilder<File?>(
                        future: _previewAsset!.file,
                        builder: (context, snapshot) {
                          if (snapshot.connectionState == ConnectionState.done && snapshot.data != null) {
                            return Image.file(snapshot.data!, fit: BoxFit.cover);
                          }
                          return const Center(child: CircularProgressIndicator(color: Colors.black));
                        },
                      )
                    : const Center(
                        child: Text(
                          "사진을 선택해 주세요",
                          style: TextStyle(color: Colors.grey),
                        ),
                      )),
          ),
          
          // 하단 그리드 영역
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Colors.black))
                : GridView.builder(
                    padding: const EdgeInsets.all(1),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      crossAxisSpacing: 1,
                      mainAxisSpacing: 1,
                    ),
                    itemCount: _assets.length + 1, // 카메라 타일 1개 추가
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        // 0번 타일: 촬영하기
                        return GestureDetector(
                          onTap: _handleCamera,
                          child: Container(
                            color: Colors.grey[200],
                            child: const Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.camera_alt, color: Colors.black, size: 28),
                                SizedBox(height: 4),
                                Text(
                                  "촬영하기",
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.black,
                                    fontWeight: FontWeight.w600,
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
                                  return Container(color: Colors.grey[200]);
                                }
                                return Image.memory(bytes, fit: BoxFit.cover);
                              },
                            ),
                            
                            // 선택 시 반투명 레이어 효과
                            if (isSelected)
                              Container(
                                color: Colors.white.withOpacity(0.2),
                              ),
                            
                            // 우상단 체크/순서 동그라미 배지
                            Positioned(
                              top: 6,
                              right: 6,
                              child: Container(
                                width: 22,
                                height: 22,
                                decoration: BoxDecoration(
                                  color: isSelected ? Colors.blue : Colors.black.withOpacity(0.4),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 1.5),
                                ),
                                child: Center(
                                  child: isSelected
                                      ? Text(
                                          "${selIdx + 1}",
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 11,
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
