// =============================================
// HTML要素
// =============================================

const imageInput = document.getElementById("imageInput");
const previewContainer = document.getElementById("previewContainer");
const batchCorrectButton = document.getElementById("batchCorrectButton");
const batchProgress = document.getElementById("batchProgress");
const imageCount = document.getElementById("imageCount");
const createPdfButton = document.getElementById("createPdfButton");
const pdfResultSection = document.getElementById("pdfResultSection");
const pdfPreview = document.getElementById("pdfPreview");
const savePdfButton = document.getElementById("savePdfButton");
const fileNameInput = document.getElementById("fileName");

// 四隅補正関係

const cropModal = document.getElementById("cropModal");
const cropCanvas = document.getElementById("cropCanvas");
const cropStatus = document.getElementById("cropStatus");
const cropFilterMode = document.getElementById("cropFilterMode");
const autoDetectCropButton = document.getElementById("autoDetectCropButton");
const resetCropButton = document.getElementById("resetCropButton");
const cancelCropButton =document.getElementById("cancelCropButton");
const applyCropButton = document.getElementById("applyCropButton");

// =============================================
// RectiScan PIN認証
// =============================================

const authScreen = document.getElementById("authScreen");
const authPinInput = document.getElementById("authPinInput");
const authButton = document.getElementById("authButton");
const authMessage = document.getElementById("authMessage");
const authError = document.getElementById("authError");
const RECTISCAN_PIN_KEY = "rectiscan_pin";

let isFirstPinSetup = !localStorage.getItem(RECTISCAN_PIN_KEY);
// 認証状態
let isAuthenticated = false;
// 認証直後のSafariイベント対策
let lastUnlockTime = 0;

// =============================================
// ロックする
// =============================================
function lockRectiScan() {
    document.body.classList.add("auth-locked");
    isAuthenticated = false;
    authPinInput.value = "";
    authError.textContent = "";
    const savedPin = localStorage.getItem(RECTISCAN_PIN_KEY);
    isFirstPinSetup = !savedPin;

    if (isFirstPinSetup) {
        authMessage.textContent = "初回設定：4〜8桁のPINを設定してください";
        authButton.textContent = "PINを設定して開始";
    }
    else {
        authMessage.textContent = "PINを入力してください";
        authButton.textContent = "ロック解除";
    }
    authScreen.style.display = "flex";
}

// =============================================
// ロック解除
// =============================================
function unlockRectiScan() {
    isAuthenticated = true;
    lastUnlockTime = Date.now();
    authPinInput.value = "";
    authError.textContent = "";
    authScreen.style.display = "none";
    document.body.classList.remove("auth-locked");
}


// =============================================
// 初期表示
// =============================================

//lockRectiScan();

// =============================================
// PIN設定 / ロック解除
// =============================================

// iPhone Safariでフォーム送信扱いにならないよう強制
authButton.type = "button";

function handleAuthButton(event) {

    // フォーム送信・ページ再読み込みを防止
    if (event) {
        event.preventDefault();
    }

    // 認証処理が実際に呼ばれたことを確認
    authError.textContent = "認証中...";

    const pin = authPinInput.value.trim();

    // =====================================
    // PIN形式チェック
    // =====================================

    if (
        !/^\d{4,8}$/.test(pin)
    ) {

        authError.textContent =
            "4〜8桁の数字を入力してください。";

        return;
    }


    // =====================================
    // 初回PIN設定
    // =====================================

    if (isFirstPinSetup) {

        try {

            localStorage.setItem(
                RECTISCAN_PIN_KEY,
                pin
            );

        }
        catch (error) {

            console.error(
                "PIN保存エラー:",
                error
            );

            authError.textContent =
                "PINを保存できませんでした。";

            return;
        }


        // 保存確認
        const savedPin =
            localStorage.getItem(
                RECTISCAN_PIN_KEY
            );


        if (
            savedPin !== pin
        ) {

            authError.textContent =
                "PINの保存に失敗しました。";

            return;
        }


        isFirstPinSetup =
            false;


        // =================================
        // 認証成功
        // =================================

        unlockRectiScan();


        return;
    }


    // =====================================
    // 通常のロック解除
    // =====================================

    const savedPin =
        localStorage.getItem(
            RECTISCAN_PIN_KEY
        );


    if (
        pin === savedPin
    ) {

        unlockRectiScan();

    }
    else {

        authError.textContent =
            "PINが違います。";

        authPinInput.value =
            "";

    }

}


// =============================================
// ボタンタップ
// =============================================

authButton.addEventListener("click", handleAuthButton);

// =============================================
// iPhone / タッチ端末用補助処理
//
// PC版には影響させない
// =============================================
let lastMobileAuthTime = 0;

if (
    window.matchMedia &&
    window.matchMedia(
        "(pointer: coarse)"
    ).matches
) {
    authButton.addEventListener(
        "pointerup",
        function (event) {
            const now = Date.now();

            // pointerupの直後にclickも来るため
            // 二重認証を防止
            if (
                now -
                lastMobileAuthTime <
                700
            ) {
                return;
            }
            lastMobileAuthTime = now;
            handleAuthButton(event);
        }
    );
}

// =============================================
// iPhoneキーボードの「完了」でも認証
// =============================================

authPinInput.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Enter"
        ) {

            handleAuthButton(
                event
            );

        }

    }
);

// =============================================
// ページ情報
// =============================================
//
// {
//     file: 元画像,
//     rotation: 回転角度,
//     correctedBlob: 補正後画像
// }
//

let pages = [];

// =============================================
// PDF関係
// =============================================

let generatedPdfBlob = null;

let pdfBlobUrl = null;


// =============================================
// 四隅補正関係
// =============================================

let cropEditingIndex = -1;

let cropSourceCanvas = null;


// 左上
// 右上
// 右下
// 左下
//
// の順番

let cropPoints = [];


// 現在ドラッグ中の点

let draggingPointIndex = -1;


// =============================================
// Fileをページ情報へ変換
// =============================================

function createPageData(
    file
) {

    return {

        file: file,

        rotation: 0,

        correctedBlob: null,

        filterMode: "document",

        autoStatus: "pending"
    };
}


// =============================================
// 写真ライブラリから選択
//
// 既存ページを残したまま
// 新しく選んだ写真を末尾へ追加
// =============================================

imageInput.addEventListener(
    "change",
    function (event) {
        const files =
            Array.from(event.target.files);
        if (
            files.length === 0
        ) {
            return;
        }

        files.forEach(
            function (file) {
                pages.push(
                    createPageData(file)
                );
            }
        );
        // PDFは作り直しが必要
        invalidateGeneratedPdf();

        // プレビュー更新
        showPreviews();

        // 同じ写真を再度選択できるようにする
        imageInput.value = "";
    }
);

// =============================================
// RectiScan 連続撮影カメラ
// =============================================

const openCameraButton =
    document.getElementById(
        "openCameraButton"
    );

const cameraModal =
    document.getElementById(
        "cameraModal"
    );

const cameraVideo =
    document.getElementById(
        "cameraVideo"
    );

const cameraCaptureCanvas =
    document.getElementById(
        "cameraCaptureCanvas"
    );

const shutterButton =
    document.getElementById(
        "shutterButton"
    );

const cameraDoneButton =
    document.getElementById(
        "cameraDoneButton"
    );

const cameraCount =
    document.getElementById(
        "cameraCount"
    );


// =============================================
// カメラライト
// =============================================

const torchButton =
    document.getElementById(
        "torchButton"
    );


let cameraStream = null;

let currentCameraCaptureCount = 0;


// iPhone Safari対策
let cameraStarting = false;

let cameraActive = false;


// =============================================
// ライト状態
// =============================================

let torchSupported = false;
let torchEnabled = false;

// =============================================
// カメラライト対応確認
// =============================================

function setupTorchControl() {

    torchEnabled = false;
    torchSupported = false;


    torchButton.classList.remove(
        "active"
    );


    torchButton.textContent =
        "ライト OFF";


    if (!cameraStream) {

        torchButton.classList.add(
            "hidden"
        );

        return;
    }


    const tracks =
        cameraStream.getVideoTracks();


    if (
        !tracks ||
        tracks.length === 0
    ) {

        torchButton.classList.add(
            "hidden"
        );

        return;
    }


    const track =
        tracks[0];


    // =====================================
    // PCでは従来どおりライトを表示しない
    // スマホ・タッチ端末だけ対象
    // =====================================

    const isMobileDevice =
        /iPhone|iPad|iPod|Android/i
            .test(
                navigator.userAgent
            )
        ||
        (
            window.matchMedia &&
            window.matchMedia(
                "(pointer: coarse)"
            ).matches
        );


    if (!isMobileDevice) {

        torchButton.classList.add(
            "hidden"
        );

        return;
    }


    // =====================================
    // デバッグ用
    // =====================================

    try {

        if (
            typeof track.getCapabilities ===
            "function"
        ) {

            console.log(
                "Camera capabilities:",
                track.getCapabilities()
            );

        }


        if (
            typeof track.getSettings ===
            "function"
        ) {

            console.log(
                "Camera settings:",
                track.getSettings()
            );

        }

    }
    catch (error) {

        console.warn(
            "カメラ情報取得:",
            error
        );

    }


    // =====================================
    // 重要
    //
    // getCapabilities().torch だけで
    // ボタン表示を決めない。
    //
    // iPhoneでは実際にapplyConstraintsを
    // 試して判断する。
    // =====================================

    if (
        typeof track.applyConstraints ===
        "function"
    ) {

        torchSupported = true;


        torchButton.classList.remove(
            "hidden"
        );


        torchButton.disabled =
            false;


        torchButton.textContent =
            "ライト OFF";

    }
    else {

        torchButton.classList.add(
            "hidden"
        );

    }

}


// =============================================
// ライトON / OFF
// =============================================

async function setCameraTorch(
    enabled
) {
    if (!cameraStream) {
        return;
    }

    const track = cameraStream.getVideoTracks()[0];

    if (!track || tracks.length === 0) {
        return;
    }

    const track = tracks[0];

    if (typeof track.applyConstraints !== "function") {
        torchButton.textContent = "ライト非対応";
        torchButton.disabled = true;
        return;
    }

    try { 
        // =====================================
        // 標準的なtorch制約
        // =====================================

        try {
            await track.applyConstraints({
                torch: enabled});
        }
        catch (advancedError) {
            // 一部ブラウザ用フォールバック
            console.warn("advanced torch失敗:", advanceError);
            await track.applyConstraints({ torch: enabled });
        }
        torchSupported = true;
        torchEnabled = enabled;

        if (torchEnabled) {
            torchButton.textContent = "ライト ON";
            torchButton.classList.add("active");
        }
        else {
            torchButton.textContent = "ライト OFF";
            torchButton.classList.remove( "active" );
        }
        try {
            console.log("Torch settings:", track.getSettings());
        }
        catch (error) { }
    }

    catch (error) {
        console.error(
            "ライト切替エラー:",
            error
        );

        alert("この端末ではカメラライトを制御できません。");

        torchSupported = false;
        torchEnabled = false;
        torchButton.classList.add("hidden");
    }
}

// =============================================
// カメラ開始
// =============================================

async function startRectiScanCamera() {

    // 二重起動防止
    if (cameraStarting) {
        return;
    }
    cameraStarting = true;

    // =====================================
    // 先にカメラ画面を表示
    // =====================================

    cameraModal.classList.remove("hidden");
    cameraCount.textContent = "カメラを準備しています...";

    try {
        // =====================================
        // HTTPS確認
        // =====================================

        if (!window.isSecureContext) {
            throw new Error("HTTPSではありません。");
        }

        // =====================================
        // getUserMedia対応確認
        // =====================================

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error("このブラウザではカメラAPIを利用できません。");
        }

        // =====================================
        // iPhone Safari向けvideo設定
        // =====================================

        cameraVideo.muted = true;
        cameraVideo.autoplay = true;
        cameraVideo.playsInline = true;

        cameraVideo.setAttribute(
            "playsinline",
            ""
        );
        cameraVideo.setAttribute(
            "muted",
            ""
        );
        cameraVideo.setAttribute(
            "autoplay",
            ""
        );

        // =====================================
        // 既存カメラを停止
        // =====================================

        if (cameraStream) {
            cameraStream
                .getTracks()
                .forEach(
                    function (track) {
                        track.stop();
                    }
                );
            cameraStream = null;
        }

        // =====================================
        // カメラそのものを取得
        //
        // ここだけ別tryにする
        // =====================================

        let stream;
        try {
            stream =
                await navigator.mediaDevices
                    .getUserMedia({
                        audio: false,
                        video: {
                            facingMode: "environment"
                        }
                    });
        }
        catch (cameraError) {
            console.error(
                "getUserMediaエラー:",
                cameraError
            );
            alert(
                "カメラの取得に失敗しました。\n\n" +
                "エラー名: " +
                cameraError.name +
                "\n\n詳細: " +
                cameraError.message
            );
            cameraModal.classList.add("hidden");
            return;
        }

        // =====================================
        // ここまで来たら
        // カメラ権限取得には成功している
        // =====================================

        cameraStream = stream;
        cameraVideo.srcObject = stream;
        cameraActive = true;
        setupTorchControl();

        // =====================================
        // video.play()は
        // カメラ権限とは別問題
        //
        // 失敗してもカメラを停止しない
        // =====================================

        try { await cameraVideo.play();}
        catch (playError) {
            console.warn( "video.play()失敗:", playError);
            // iPhoneでは後で
            // 撮影ボタンから再度play()する
        }
        currentCameraCaptureCount = 0;
        cameraCount.textContent = "撮影済み 0枚";
    }
    catch (error) {
        console.error("カメラ初期化エラー:", error);
        alert("カメラ初期化に失敗しました。\n\n" + error.message);
        stopRectiScanCamera();
    }
    finally { cameraStarting = false;}
}

// =============================================
// カメラ終了
// =============================================
function stopRectiScanCamera() {
    if (cameraStream) {
        cameraStream
            .getTracks()
            .forEach(
                function (track) {
                    track.stop();
                }
            );
    }
    cameraStream = null;
    cameraActive = false;

    // =====================================
    // ライト状態をリセット
    // =====================================
    torchEnabled = false;
    torchSupported = false;
    torchButton.textContent = "ライト OFF";
    torchButton.classList.remove( "active" );
    torchButton.classList.add( "hidden" );
    cameraVideo.srcObject = null;
    cameraModal.classList.add( "hidden" );
}

// =============================================
// iPhone / Safari
// アプリを離れたらロック
// =============================================

document.addEventListener(
    "visibilitychange",
    function () {
        if (
            document.visibilityState !==
            "hidden"
        ) {
            return;
        }
        // =====================================
        // PIN画面の段階なら何もしない
        // =====================================
        if (!isAuthenticated) {
            return;
        }

        // =====================================
        // 認証直後2秒間は無視
        //
        // iPhone Safariの
        // キーボード/UI状態変化対策
        // =====================================
        if (
            Date.now() -
            lastUnlockTime <
            2000
        ) {
            return;
        }
        // =====================================
        // カメラ起動処理中も無視
        // =====================================
        if (cameraStarting) {
            return;
        }
        if (cameraStream) {
            stopRectiScanCamera();
        }
        lockRectiScan();
    }
);

// =============================================
// Safariのページ復元時にも再ロック
// =============================================

window.addEventListener(
    "pageshow",
    function (event) {

        // Safariの履歴キャッシュから
        // 復元された場合だけロック
        if (
            event.persisted &&
            isAuthenticated
        ) {

            lockRectiScan();

        }

    }
);

// =============================================
// 撮影
// =============================================

async function captureCameraFrame() {

    // =====================================
    // カメラ映像がまだ準備できていない
    // =====================================

    if (
        !cameraStream ||
        cameraVideo.readyState < 2 ||
        cameraVideo.videoWidth === 0 ||
        cameraVideo.videoHeight === 0
    ) {

        alert(
            "カメラ映像を準備中です。\n少し待ってから撮影してください。"
        );

        return;
    }


    shutterButton.disabled =
        true;


    try {

        const canvas =
            cameraCaptureCanvas;


        const context =
            canvas.getContext(
                "2d",
                {
                    alpha: false
                }
            );


        // =====================================
        // 実際のカメラ解像度をそのまま使用
        // =====================================

        canvas.width =
            cameraVideo.videoWidth;

        canvas.height =
            cameraVideo.videoHeight;


        context.drawImage(
            cameraVideo,
            0,
            0,
            canvas.width,
            canvas.height
        );


        // =====================================
        // JPEG化
        // =====================================

        const blob =
            await new Promise(
                function (
                    resolve,
                    reject
                ) {

                    canvas.toBlob(
                        function (result) {

                            if (result) {

                                resolve(
                                    result
                                );

                            }
                            else {

                                reject(
                                    new Error(
                                        "JPEG生成失敗"
                                    )
                                );

                            }

                        },

                        "image/jpeg",

                        0.95
                    );

                }
            );


        // =====================================
        // File作成
        // =====================================

        const file =
            new File(

                [blob],

                "RectiScan_" +
                Date.now() +
                ".jpg",

                {
                    type:
                        "image/jpeg"
                }

            );


        // =====================================
        // 既存ページへ追加
        // =====================================

        pages.push(
            createPageData(
                file
            )
        );


        currentCameraCaptureCount++;


        cameraCount.textContent =
            "撮影済み " +
            currentCameraCaptureCount +
            "枚";


        invalidateGeneratedPdf();


        // ★ここでカメラを停止しない
        // ★modalも閉じない
        // ★showPreviews()もしない

    }
    catch (error) {

        console.error(
            "撮影エラー:",
            error
        );


        alert(
            "写真の保存に失敗しました。"
        );

    }
    finally {

        shutterButton.disabled =
            false;

    }

}


// =============================================
// ボタン
// =============================================

openCameraButton.addEventListener(
    "click",
    startRectiScanCamera
);

torchButton.addEventListener(
    "click",
    async function (event) {
        event.preventDefault();
        event.stopPropagation();
        await setCameraTorch(
            !torchEnabled
        );
    }
);

shutterButton.addEventListener(
    "click",
    captureCameraFrame
);


cameraDoneButton.addEventListener(
    "click",
    function () {

        stopRectiScanCamera();

        showPreviews();

    }
);

// =============================================
// 用紙サイズ変更
// =============================================

document
    .querySelectorAll(
        'input[name="paperSize"]'
    )
    .forEach(
        function (radio) {

            radio.addEventListener(
                "change",
                function () {

                    invalidateGeneratedPdf();
                }
            );
        }
    );


// =============================================
// 現在使用する画像
// =============================================

function getPageSource(pageData) {

    if (pageData.correctedBlob !== null) {

        return pageData.correctedBlob;
    }


    return pageData.file;
}


// =============================================
// PDFを無効化
// =============================================

function invalidateGeneratedPdf() {

    generatedPdfBlob = null;


    if (pdfBlobUrl !== null) {

        URL.revokeObjectURL(
            pdfBlobUrl
        );

        pdfBlobUrl = null;
    }


    pdfPreview.src = "";

    pdfResultSection.style.display =
        "none";
}


// =============================================
// プレビュー表示
// =============================================

function showPreviews() {

    previewContainer.innerHTML = "";


    if (pages.length === 0) {

        previewContainer.innerHTML =
            "<p>写真を選択すると、ここに表示されます。</p>";

        imageCount.textContent =
            "写真が選択されていません";

        createPdfButton.disabled =
            true;

        batchCorrectButton.disabled =
            true;

        return;
    }


    imageCount.textContent =
        pages.length +
        " 枚の写真を選択しました";


    createPdfButton.disabled =
        false;

    batchCorrectButton.disabled =
        false;

    pages.forEach(
        function (pageData, index) {

            // =========================
            // ページ本体
            // =========================

            const previewItem =
                document.createElement("div");

            previewItem.className =
                "preview-item";


            // =========================
            // 画像
            // =========================

            const imageWrapper =
                document.createElement("div");

            imageWrapper.className =
                "preview-image-wrapper";


            const img =
                document.createElement("img");


            const imageUrl =
                URL.createObjectURL(
                    getPageSource(pageData)
                );


            img.src =
                imageUrl;


            img.style.transform =
                "rotate(" +
                pageData.rotation +
                "deg)";


            img.onload =
                function () {

                    URL.revokeObjectURL(
                        imageUrl
                    );
                };


            imageWrapper.appendChild(img);


            // =========================
            // ページ番号
            // =========================

            const pageNumber =
                document.createElement("div");

            pageNumber.className =
                "page-number";

            pageNumber.textContent =
                index + 1;

            // =========================
            // 処理状態
            // =========================

            const statusBadge =
                document.createElement(
                    "div"
                );


            statusBadge.className =
                "page-status";


            if (
                pageData.autoStatus ===
                "success"
            ) {

                statusBadge.classList.add(
                    "page-status-success"
                );

                statusBadge.textContent =
                    "✓ 自動補正";

            }

            else if (
                pageData.autoStatus ===
                "failed"
            ) {

                statusBadge.classList.add(
                    "page-status-failed"
                );

                statusBadge.textContent =
                    "⚠ 要確認";

            }

            else if (
                pageData.autoStatus ===
                "manual"
            ) {

                statusBadge.classList.add(
                    "page-status-manual"
                );

                statusBadge.textContent =
                    "✓ 手動補正";

            }

            else if (
                pageData.autoStatus ===
                "processing"
            ) {

                statusBadge.classList.add(
                    "page-status-processing"
                );

                statusBadge.textContent =
                    "処理中...";
            }

            // =========================
            // 操作領域
            // =========================

            const controls =
                document.createElement("div");

            controls.className =
                "preview-controls";


            // =========================
            // 回転
            // =========================

            const rotateButton =
                document.createElement("button");

            rotateButton.className =
                "preview-control-button";

            rotateButton.textContent =
                "↻ 回転";


            rotateButton.addEventListener(
                "click",
                function () {

                    pages[index].rotation =
                        (
                            pages[index].rotation
                            + 90
                        ) % 360;


                    invalidateGeneratedPdf();

                    showPreviews();
                }
            );


            // =========================
            // 左へ
            // =========================

            const leftButton =
                document.createElement("button");

            leftButton.className =
                "preview-control-button";

            leftButton.textContent =
                "← 左へ";


            if (index === 0) {

                leftButton.disabled =
                    true;
            }


            leftButton.addEventListener(
                "click",
                function () {

                    if (index === 0) {

                        return;
                    }


                    [
                        pages[index - 1],
                        pages[index]
                    ] =
                        [
                            pages[index],
                            pages[index - 1]
                        ];


                    invalidateGeneratedPdf();

                    showPreviews();
                }
            );


            // =========================
            // 右へ
            // =========================

            const rightButton =
                document.createElement("button");

            rightButton.className =
                "preview-control-button";

            rightButton.textContent =
                "右へ →";


            if (
                index ===
                pages.length - 1
            ) {

                rightButton.disabled =
                    true;
            }


            rightButton.addEventListener(
                "click",
                function () {

                    if (
                        index ===
                        pages.length - 1
                    ) {

                        return;
                    }


                    [
                        pages[index],
                        pages[index + 1]
                    ] =
                        [
                            pages[index + 1],
                            pages[index]
                        ];


                    invalidateGeneratedPdf();

                    showPreviews();
                }
            );


            // =========================
            // 削除
            // =========================

            const deleteButton =
                document.createElement("button");

            deleteButton.className =
                "preview-control-button delete-button";

            deleteButton.textContent =
                "削除";


            deleteButton.addEventListener(
                "click",
                function () {

                    const result =
                        confirm(
                            "ページ " +
                            (index + 1) +
                            " を削除しますか？"
                        );


                    if (!result) {

                        return;
                    }


                    pages.splice(
                        index,
                        1
                    );


                    invalidateGeneratedPdf();

                    showPreviews();
                }
            );


            // =========================
            // 四隅補正
            // =========================

            const cropButton =
                document.createElement("button");

            cropButton.className =
                "crop-button";

            cropButton.textContent =
                "四隅補正";


            cropButton.addEventListener(
                "click",
                function () {

                    openCropEditor(
                        index
                    );
                }
            );


            // =========================
            // 操作ボタン追加
            // =========================

            controls.appendChild(
                rotateButton
            );

            controls.appendChild(
                leftButton
            );

            controls.appendChild(
                rightButton
            );

            controls.appendChild(
                deleteButton
            );

            controls.appendChild(
                cropButton
            );


            // =========================
            // ページ完成
            // =========================

            previewItem.appendChild(
                imageWrapper
            );

            previewItem.appendChild(
                pageNumber
            );

            if (
                pageData.autoStatus !==
                "pending"
            ) {

                previewItem.appendChild(
                    statusBadge
                );
            }

            previewItem.appendChild(
                controls
            );


            previewContainer.appendChild(
                previewItem
            );
        }
    );
}


// =============================================
// Blob / Fileから画像を読み込む
// =============================================

function loadImageFromBlob(blob) {

    return new Promise(
        function (resolve, reject) {

            const imageUrl =
                URL.createObjectURL(
                    blob
                );


            const img =
                new Image();


            img.onload =
                function () {

                    URL.revokeObjectURL(
                        imageUrl
                    );

                    resolve(img);
                };


            img.onerror =
                function (error) {

                    URL.revokeObjectURL(
                        imageUrl
                    );

                    reject(error);
                };


            img.src =
                imageUrl;
        }
    );
}


// =============================================
// ページをCanvas化
// 回転も反映
// =============================================

async function pageToCanvas(
    pageData
) {

    const source =
        getPageSource(
            pageData
        );


    const img =
        await loadImageFromBlob(
            source
        );


    const angle =
        (
            (
                pageData.rotation %
                360
            )
            + 360
        ) % 360;


    const canvas =
        document.createElement(
            "canvas"
        );


    if (
        angle === 90 ||
        angle === 270
    ) {

        canvas.width =
            img.naturalHeight;

        canvas.height =
            img.naturalWidth;

    } else {

        canvas.width =
            img.naturalWidth;

        canvas.height =
            img.naturalHeight;
    }


    const ctx =
        canvas.getContext(
            "2d"
        );


    ctx.fillStyle =
        "white";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    ctx.save();


    if (angle === 0) {

        ctx.drawImage(
            img,
            0,
            0
        );

    } else if (angle === 90) {

        ctx.translate(
            canvas.width,
            0
        );

        ctx.rotate(
            Math.PI / 2
        );

        ctx.drawImage(
            img,
            0,
            0
        );

    } else if (angle === 180) {

        ctx.translate(
            canvas.width,
            canvas.height
        );

        ctx.rotate(
            Math.PI
        );

        ctx.drawImage(
            img,
            0,
            0
        );

    } else if (angle === 270) {

        ctx.translate(
            0,
            canvas.height
        );

        ctx.rotate(
            -Math.PI / 2
        );

        ctx.drawImage(
            img,
            0,
            0
        );
    }


    ctx.restore();


    return canvas;
}


// =============================================
// Canvas → JPEG Blob
// =============================================

function canvasToJpegBlob(
    canvas,
    quality = 0.92
) {

    return new Promise(
        function (resolve, reject) {

            canvas.toBlob(
                function (blob) {

                    if (blob === null) {

                        reject(
                            new Error(
                                "JPEG変換に失敗しました。"
                            )
                        );

                        return;
                    }


                    resolve(blob);
                },
                "image/jpeg",
                quality
            );
        }
    );
}

// =============================================
// 画像フィルター
//
// original  : 元画像
// grayscale : グレースケール
// document  : 強い白黒ドキュメント
// =============================================

async function applyFilterToCanvas(
    sourceCanvas,
    mode
) {

    console.log(
        "フィルターモード:",
        mode
    );


    // =========================================
    // 元画像
    // =========================================

    if (
        mode === "original"
    ) {

        const copyCanvas =
            document.createElement(
                "canvas"
            );


        copyCanvas.width =
            sourceCanvas.width;

        copyCanvas.height =
            sourceCanvas.height;


        const context =
            copyCanvas.getContext(
                "2d"
            );


        context.drawImage(
            sourceCanvas,
            0,
            0
        );


        return copyCanvas;
    }


    const cv =
        await getOpenCv();


    let src = null;
    let gray = null;
    let background = null;
    let flat = null;
    let blurred = null;
    let binary = null;
    let display = null;


    try {

        src =
            cv.imread(
                sourceCanvas
            );


        gray =
            new cv.Mat();


        // =====================================
        // RGBA → グレースケール
        // =====================================

        cv.cvtColor(
            src,
            gray,
            cv.COLOR_RGBA2GRAY
        );


        // =====================================
        // グレースケール
        // =====================================

        if (
            mode === "grayscale"
        ) {

            display =
                new cv.Mat();


            cv.cvtColor(
                gray,
                display,
                cv.COLOR_GRAY2RGBA
            );


            const outputCanvas =
                document.createElement(
                    "canvas"
                );


            outputCanvas.width =
                sourceCanvas.width;

            outputCanvas.height =
                sourceCanvas.height;


            cv.imshow(
                outputCanvas,
                display
            );


            return outputCanvas;
        }


        // =====================================
        // DOCUMENTモード
        // =====================================

        if (
            mode === "document"
        ) {

            background =
                new cv.Mat();

            flat =
                new cv.Mat();

            blurred =
                new cv.Mat();

            binary =
                new cv.Mat();

            display =
                new cv.Mat();


            // =================================
            // 1. 背景照明を推定
            //
            // かなり大きくぼかし、
            // 紙の影・照明ムラだけを取得
            // =================================

            cv.GaussianBlur(
                gray,
                background,
                new cv.Size(
                    51,
                    51
                ),
                0
            );


            // =================================
            // 2. 背景を除去
            //
            // gray / background
            //
            // 紙面の明るさを均一化
            // =================================

            cv.divide(
                gray,
                background,
                flat,
                255
            );


            // =================================
            // 3. 小さなノイズだけ除去
            // =================================

            cv.GaussianBlur(
                flat,
                blurred,
                new cv.Size(
                    3,
                    3
                ),
                0
            );


            // =================================
            // 4. 強い白黒2値化
            //
            // 今回は最終的に
            // 0 または 255 にする
            // =================================

            cv.adaptiveThreshold(
                blurred,
                binary,
                255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY,
                41,
                11
            );


            // =================================
            // 5. RGBAへ変換
            // =================================

            cv.cvtColor(
                binary,
                display,
                cv.COLOR_GRAY2RGBA
            );


            // =================================
            // Canvasへ出力
            // =================================

            const outputCanvas =
                document.createElement(
                    "canvas"
                );


            outputCanvas.width =
                sourceCanvas.width;

            outputCanvas.height =
                sourceCanvas.height;


            cv.imshow(
                outputCanvas,
                display
            );


            // =================================
            // デバッグ
            //
            // documentならここを通る必要がある
            // =================================

            console.log(
                "ドキュメント2値化を適用しました"
            );


            return outputCanvas;
        }


        throw new Error(
            "未知のフィルターモードです: " +
            mode
        );

    } finally {

        if (src !== null) {
            src.delete();
        }

        if (gray !== null) {
            gray.delete();
        }

        if (background !== null) {
            background.delete();
        }

        if (flat !== null) {
            flat.delete();
        }

        if (blurred !== null) {
            blurred.delete();
        }

        if (binary !== null) {
            binary.delete();
        }

        if (display !== null) {
            display.delete();
        }
    }
}

// =============================================
// 4点から
// 台形補正＋フィルター＋JPEG生成
// =============================================

async function createCorrectedDocument(
    sourceCanvas,
    sourcePoints,
    filterMode
) {

    const cv =
        await getOpenCv();


    let src = null;
    let dst = null;

    let srcTri = null;
    let dstTri = null;

    let matrix = null;


    try {

        // =====================================
        // 各辺の長さ
        // =====================================

        const top =
            pointDistance(
                sourcePoints[0],
                sourcePoints[1]
            );


        const right =
            pointDistance(
                sourcePoints[1],
                sourcePoints[2]
            );


        const bottom =
            pointDistance(
                sourcePoints[2],
                sourcePoints[3]
            );


        const left =
            pointDistance(
                sourcePoints[3],
                sourcePoints[0]
            );


        const horizontal =
            Math.max(
                top,
                bottom
            );


        const vertical =
            Math.max(
                left,
                right
            );


        // A4/B5ともほぼ √2
        const paperRatio =
            Math.SQRT2;


        let outputWidth;
        let outputHeight;


        // =====================================
        // 縦向き
        // =====================================

        if (
            vertical >=
            horizontal
        ) {

            outputWidth =
                Math.max(
                    horizontal,
                    vertical /
                    paperRatio
                );


            outputHeight =
                outputWidth *
                paperRatio;

        } else {

            // =================================
            // 横向き
            // =================================

            outputHeight =
                Math.max(
                    vertical,
                    horizontal /
                    paperRatio
                );


            outputWidth =
                outputHeight *
                paperRatio;
        }


        outputWidth =
            Math.round(
                outputWidth
            );


        outputHeight =
            Math.round(
                outputHeight
            );


        // =====================================
        // iPhoneのメモリ消費対策
        // =====================================

        const maxLongEdge =
            3508;


        const longEdge =
            Math.max(
                outputWidth,
                outputHeight
            );


        if (
            longEdge >
            maxLongEdge
        ) {

            const resizeScale =
                maxLongEdge /
                longEdge;


            outputWidth =
                Math.round(
                    outputWidth *
                    resizeScale
                );


            outputHeight =
                Math.round(
                    outputHeight *
                    resizeScale
                );
        }


        // =====================================
        // Perspective Transform
        // =====================================

        src =
            cv.imread(
                sourceCanvas
            );


        dst =
            new cv.Mat();


        srcTri =
            cv.matFromArray(
                4,
                1,
                cv.CV_32FC2,
                [
                    sourcePoints[0].x,
                    sourcePoints[0].y,

                    sourcePoints[1].x,
                    sourcePoints[1].y,

                    sourcePoints[2].x,
                    sourcePoints[2].y,

                    sourcePoints[3].x,
                    sourcePoints[3].y
                ]
            );


        dstTri =
            cv.matFromArray(
                4,
                1,
                cv.CV_32FC2,
                [
                    0,
                    0,

                    outputWidth - 1,
                    0,

                    outputWidth - 1,
                    outputHeight - 1,

                    0,
                    outputHeight - 1
                ]
            );


        matrix =
            cv.getPerspectiveTransform(
                srcTri,
                dstTri
            );


        cv.warpPerspective(
            src,
            dst,
            matrix,
            new cv.Size(
                outputWidth,
                outputHeight
            ),
            cv.INTER_LINEAR,
            cv.BORDER_CONSTANT,
            new cv.Scalar(
                255,
                255,
                255,
                255
            )
        );


        // =====================================
        // Canvasへ出力
        // =====================================

        const outputCanvas =
            document.createElement(
                "canvas"
            );


        outputCanvas.width =
            outputWidth;

        outputCanvas.height =
            outputHeight;


        cv.imshow(
            outputCanvas,
            dst
        );


        // =====================================
        // ドキュメントフィルター
        // =====================================

        const filteredCanvas =
            await applyFilterToCanvas(
                outputCanvas,
                filterMode
            );


        // =====================================
        // JPEG
        // =====================================

        return await canvasToJpegBlob(
            filteredCanvas,
            0.95
        );

    } finally {

        if (src !== null) {
            src.delete();
        }

        if (dst !== null) {
            dst.delete();
        }

        if (srcTri !== null) {
            srcTri.delete();
        }

        if (dstTri !== null) {
            dstTri.delete();
        }

        if (matrix !== null) {
            matrix.delete();
        }
    }
}

// =============================================
// 1ページ自動補正
// =============================================

async function autoCorrectPage(
    index
) {

    const pageData =
        pages[index];


    // =========================================
    // 既に補正済みならスキップ
    // =========================================

    if (
        pageData.correctedBlob !==
        null
    ) {

        return "skipped";
    }


    pageData.autoStatus =
        "processing";


    showPreviews();


    // =========================================
    // 元画像をCanvasへ
    // =========================================

    cropSourceCanvas =
        await pageToCanvas(
            pageData
        );


    // =========================================
    // 自動検出用Canvasサイズ
    //
    // openCropEditor() と同じ考え方
    // =========================================

    const maxWidth =
        900;

    const maxHeight =
        700;


    const displayScale =
        Math.min(
            1,

            maxWidth /
            cropSourceCanvas.width,

            maxHeight /
            cropSourceCanvas.height
        );


    cropCanvas.width =
        Math.max(
            1,
            Math.round(
                cropSourceCanvas.width *
                displayScale
            )
        );


    cropCanvas.height =
        Math.max(
            1,
            Math.round(
                cropSourceCanvas.height *
                displayScale
            )
        );


    resetCropPoints();


    // =========================================
    // 四隅自動検出
    // =========================================

    const detected =
        await autoDetectPaperCorners();


    if (!detected) {

        pageData.autoStatus =
            "failed";


        return "failed";
    }


    // =========================================
    // cropCanvas座標
    // ↓
    // 元画像座標
    // =========================================

    const scaleX =
        cropSourceCanvas.width /
        cropCanvas.width;


    const scaleY =
        cropSourceCanvas.height /
        cropCanvas.height;


    const sourcePoints =
        cropPoints.map(
            function (point) {

                return {

                    x:
                        point.x *
                        scaleX,

                    y:
                        point.y *
                        scaleY
                };
            }
        );


    // =========================================
    // 台形補正＋フィルター
    // =========================================

    const correctedBlob =
        await createCorrectedDocument(
            cropSourceCanvas,
            sourcePoints,
            pageData.filterMode ||
            "document"
        );


    pageData.correctedBlob =
        correctedBlob;


    // 回転は補正画像へ反映済み
    pageData.rotation =
        0;


    pageData.autoStatus =
        "success";


    return "success";
}

// =============================================
// 一括自動補正
// =============================================

batchCorrectButton.addEventListener(
    "click",
    async function () {

        if (
            pages.length === 0
        ) {

            return;
        }


        batchCorrectButton.disabled =
            true;

        createPdfButton.disabled =
            true;

        imageInput.disabled =
            true;


        invalidateGeneratedPdf();


        let successCount =
            0;

        let failedCount =
            0;

        let skippedCount =
            0;


        try {

            // =================================
            // 重要：
            // Promise.allにはしない
            //
            // iPhoneのメモリ対策として
            // 1枚ずつ処理する
            // =================================

            for (
                let i = 0;
                i < pages.length;
                i++
            ) {

                batchProgress.textContent =
                    (
                        i + 1
                    ) +
                    " / " +
                    pages.length +
                    " ページを処理しています...";


                try {

                    const result =
                        await autoCorrectPage(
                            i
                        );


                    if (
                        result ===
                        "success"
                    ) {

                        successCount++;

                    } else if (
                        result ===
                        "failed"
                    ) {

                        failedCount++;

                    } else {

                        skippedCount++;
                    }

                } catch (error) {

                    console.error(
                        "ページ " +
                        (
                            i + 1
                        ) +
                        " の自動補正に失敗:",
                        error
                    );


                    pages[
                        i
                    ].autoStatus =
                        "failed";


                    failedCount++;
                }


                showPreviews();


                // =================================
                // UI描画とメモリ開放のため
                // 少しだけ待つ
                // =================================

                await new Promise(
                    function (resolve) {

                        setTimeout(
                            resolve,
                            50
                        );
                    }
                );
            }


            batchProgress.textContent =
                "完了："
                +
                successCount
                +
                "ページ自動補正 / "
                +
                failedCount
                +
                "ページ要確認"
                +
                (
                    skippedCount > 0
                        ?
                        " / " +
                        skippedCount +
                        "ページ補正済み"
                        :
                        ""
                );


        } finally {

            // 一括処理で使った一時状態を解除
            cropSourceCanvas =
                null;

            cropPoints =
                [];


            batchCorrectButton.disabled =
                false;

            createPdfButton.disabled =
                (
                    pages.length === 0
                );

            imageInput.disabled =
                false;


            showPreviews();
        }
    }
);

// =============================================
// PDF用JPEG
// =============================================

async function pageToJpegBytes(
    pageData
) {

    const canvas =
        await pageToCanvas(
            pageData
        );


    const blob =
        await canvasToJpegBlob(
            canvas,
            0.9
        );


    const arrayBuffer =
        await blob.arrayBuffer();


    return new Uint8Array(
        arrayBuffer
    );
}


// =============================================
// 四隅補正画面を開く
// =============================================

async function openCropEditor(
    index
) {

    cropEditingIndex =
        index;


    cropStatus.textContent =
        "画像を読み込んでいます...";


    cropModal.classList.add(
        "open"
    );


    document.body.classList.add(
        "modal-open"
    );


    applyCropButton.disabled =
        true;


    try {

        cropSourceCanvas =
            await pageToCanvas(
                pages[index]
            );

        cropFilterMode.value =
            pages[index].filterMode || "document";

        // 編集画面は大きすぎないよう縮小表示
        const maxWidth =
            900;

        const maxHeight =
            700;


        const scale =
            Math.min(
                1,
                maxWidth /
                cropSourceCanvas.width,
                maxHeight /
                cropSourceCanvas.height
            );


        cropCanvas.width =
            Math.max(
                1,
                Math.round(
                    cropSourceCanvas.width *
                    scale
                )
            );


        cropCanvas.height =
            Math.max(
                1,
                Math.round(
                    cropSourceCanvas.height *
                    scale
                )
            );


        resetCropPoints();


        drawCropEditor();


        cropStatus.textContent =
            "紙の四隅を自動検出しています...";


        applyCropButton.disabled =
            false;


        autoDetectCropButton.disabled =
            true;


        try {

            const detected =
                await autoDetectPaperCorners();


            if (detected) {

                cropStatus.textContent =
                    "紙の四隅を自動検出しました。" +
                    "ずれている場合は丸を動かして修正してください。";

            } else {

                cropStatus.textContent =
                    "紙の四隅を自動検出できませんでした。" +
                    "丸を手動で紙の四隅に合わせてください。";
            }

        } catch (error) {

            console.error(
                "四隅自動検出:",
                error
            );


            cropStatus.textContent =
                "自動検出に失敗しました。" +
                "丸を手動で紙の四隅に合わせてください。";

        } finally {

            autoDetectCropButton.disabled =
                false;
        }

    } catch (error) {

        console.error(error);


        cropStatus.textContent =
            "画像を読み込めませんでした。";


        alert(
            "画像の読み込みに失敗しました。"
        );
    }
}


// =============================================
// 四隅位置を初期化
// =============================================

function resetCropPoints() {

    const margin =
        Math.max(
            12,
            Math.min(
                cropCanvas.width,
                cropCanvas.height
            ) * 0.04
        );


    cropPoints =
        [
            // 左上
            {
                x: margin,
                y: margin
            },

            // 右上
            {
                x:
                    cropCanvas.width -
                    margin,
                y: margin
            },

            // 右下
            {
                x:
                    cropCanvas.width -
                    margin,
                y:
                    cropCanvas.height -
                    margin
            },

            // 左下
            {
                x: margin,
                y:
                    cropCanvas.height -
                    margin
            }
        ];
}


// =============================================
// 四隅補正画面描画
// =============================================

function drawCropEditor() {

    if (
        cropSourceCanvas === null
    ) {

        return;
    }


    const ctx =
        cropCanvas.getContext(
            "2d"
        );


    // 元画像
    ctx.clearRect(
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
    );


    ctx.drawImage(
        cropSourceCanvas,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
    );


    // =========================
    // 四角形
    // =========================

    ctx.save();


    ctx.lineWidth = 3;

    ctx.strokeStyle =
        "#00a7ff";

    ctx.fillStyle =
        "rgba(0, 167, 255, 0.12)";


    ctx.beginPath();

    ctx.moveTo(
        cropPoints[0].x,
        cropPoints[0].y
    );


    for (
        let i = 1;
        i < cropPoints.length;
        i++
    ) {

        ctx.lineTo(
            cropPoints[i].x,
            cropPoints[i].y
        );
    }


    ctx.closePath();

    ctx.fill();

    ctx.stroke();


    // =========================
    // 4個のハンドル
    // =========================

    cropPoints.forEach(
        function (point) {

            ctx.beginPath();

            ctx.arc(
                point.x,
                point.y,
                11,
                0,
                Math.PI * 2
            );


            ctx.fillStyle =
                "#007aff";

            ctx.fill();


            ctx.lineWidth = 3;

            ctx.strokeStyle =
                "white";

            ctx.stroke();
        }
    );


    ctx.restore();
}


// =============================================
// ポインタ座標
// =============================================

function getCropPointerPosition(
    event
) {

    const rect =
        cropCanvas.getBoundingClientRect();


    return {

        x:
            (
                event.clientX -
                rect.left
            ) *
            cropCanvas.width /
            rect.width,

        y:
            (
                event.clientY -
                rect.top
            ) *
            cropCanvas.height /
            rect.height
    };
}


// =============================================
// 点をつかむ
// =============================================

cropCanvas.addEventListener(
    "pointerdown",
    function (event) {

        const pointer =
            getCropPointerPosition(
                event
            );


        const rect =
            cropCanvas.getBoundingClientRect();


        // 画面上約35px以内なら選択
        const threshold =
            35 *
            cropCanvas.width /
            rect.width;


        let nearestIndex =
            -1;

        let nearestDistance =
            Infinity;


        cropPoints.forEach(
            function (point, index) {

                const dx =
                    point.x -
                    pointer.x;

                const dy =
                    point.y -
                    pointer.y;


                const distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );


                if (
                    distance <
                    nearestDistance
                ) {

                    nearestDistance =
                        distance;

                    nearestIndex =
                        index;
                }
            }
        );


        if (
            nearestDistance <=
            threshold
        ) {

            draggingPointIndex =
                nearestIndex;


            cropCanvas.setPointerCapture(
                event.pointerId
            );


            event.preventDefault();
        }
    }
);


// =============================================
// 点を動かす
// =============================================

cropCanvas.addEventListener(
    "pointermove",
    function (event) {

        if (
            draggingPointIndex < 0
        ) {

            return;
        }


        const pointer =
            getCropPointerPosition(
                event
            );


        cropPoints[
            draggingPointIndex
        ].x =
            Math.max(
                0,
                Math.min(
                    cropCanvas.width,
                    pointer.x
                )
            );


        cropPoints[
            draggingPointIndex
        ].y =
            Math.max(
                0,
                Math.min(
                    cropCanvas.height,
                    pointer.y
                )
            );


        drawCropEditor();


        event.preventDefault();
    }
);


// =============================================
// 点を離す
// =============================================

function endCropDrag(
    event
) {

    draggingPointIndex =
        -1;


    if (
        cropCanvas.hasPointerCapture(
            event.pointerId
        )
    ) {

        cropCanvas.releasePointerCapture(
            event.pointerId
        );
    }
}


cropCanvas.addEventListener(
    "pointerup",
    endCropDrag
);


cropCanvas.addEventListener(
    "pointercancel",
    endCropDrag
);


// =============================================
// 位置リセット
// =============================================

resetCropButton.addEventListener(
    "click",
    function () {

        resetCropPoints();

        drawCropEditor();
    }
);


// =============================================
// 補正画面を閉じる
// =============================================

function closeCropEditor() {

    cropModal.classList.remove(
        "open"
    );


    document.body.classList.remove(
        "modal-open"
    );


    cropEditingIndex =
        -1;

    cropSourceCanvas =
        null;

    cropPoints =
        [];

    draggingPointIndex =
        -1;
}


cancelCropButton.addEventListener(
    "click",
    function () {

        closeCropEditor();
    }
);


// =============================================
// 四角形が正常か確認
// =============================================

function isValidQuadrilateral(
    points
) {

    if (
        points.length !== 4
    ) {

        return false;
    }


    let sign = 0;


    for (
        let i = 0;
        i < 4;
        i++
    ) {

        const a =
            points[i];

        const b =
            points[
            (i + 1) % 4
            ];

        const c =
            points[
            (i + 2) % 4
            ];


        const cross =
            (
                b.x - a.x
            ) *
            (
                c.y - b.y
            )
            -
            (
                b.y - a.y
            ) *
            (
                c.x - b.x
            );


        if (
            Math.abs(cross) <
            1
        ) {

            return false;
        }


        const currentSign =
            Math.sign(cross);


        if (sign === 0) {

            sign =
                currentSign;

        } else if (
            sign !== currentSign
        ) {

            return false;
        }
    }


    return true;
}

// =============================================
// 4点を
//
// 左上 → 右上 → 右下 → 左下
//
// に並び替える
// =============================================

function orderFourPoints(points) {

    if (points.length !== 4) {

        throw new Error(
            "四隅の点数が4ではありません。"
        );
    }


    let topLeft = null;
    let topRight = null;
    let bottomRight = null;
    let bottomLeft = null;


    let minSum = Infinity;
    let maxSum = -Infinity;

    let minDiff = Infinity;
    let maxDiff = -Infinity;


    points.forEach(
        function (point) {

            // x + y
            const sum =
                point.x +
                point.y;


            // x - y
            const diff =
                point.x -
                point.y;


            // 左上
            if (sum < minSum) {

                minSum = sum;

                topLeft =
                    point;
            }


            // 右下
            if (sum > maxSum) {

                maxSum = sum;

                bottomRight =
                    point;
            }


            // 左下
            if (diff < minDiff) {

                minDiff = diff;

                bottomLeft =
                    point;
            }


            // 右上
            if (diff > maxDiff) {

                maxDiff = diff;

                topRight =
                    point;
            }
        }
    );


    return [
        topLeft,
        topRight,
        bottomRight,
        bottomLeft
    ];
}

// =============================================
// 四角形の面積
// =============================================

function quadrilateralArea(points) {

    let area = 0;


    for (
        let i = 0;
        i < 4;
        i++
    ) {

        const j =
            (i + 1) % 4;


        area +=
            points[i].x *
            points[j].y;

        area -=
            points[j].x *
            points[i].y;
    }


    return Math.abs(
        area / 2
    );
}


// =============================================
// 角度の良さ
//
// 1に近いほど90°に近い
// =============================================

function calculateAngleScore(
    points
) {

    let total = 0;


    for (
        let i = 0;
        i < 4;
        i++
    ) {

        const previous =
            points[
            (i + 3) % 4
            ];

        const current =
            points[i];

        const next =
            points[
            (i + 1) % 4
            ];


        const ax =
            previous.x -
            current.x;

        const ay =
            previous.y -
            current.y;


        const bx =
            next.x -
            current.x;

        const by =
            next.y -
            current.y;


        const lengthA =
            Math.sqrt(
                ax * ax +
                ay * ay
            );


        const lengthB =
            Math.sqrt(
                bx * bx +
                by * by
            );


        if (
            lengthA === 0 ||
            lengthB === 0
        ) {

            return 0;
        }


        const cos =
            Math.abs(
                (
                    ax * bx +
                    ay * by
                )
                /
                (
                    lengthA *
                    lengthB
                )
            );


        // 極端に尖っているものは
        // 紙として不自然
        if (cos > 0.90) {

            return 0;
        }


        total +=
            1 - cos;
    }


    return total / 4;
}


// =============================================
// A4/B5らしい比率か
//
// A4とB5はどちらもほぼ √2
// =============================================

function calculatePaperRatioScore(
    points
) {

    const top =
        pointDistance(
            points[0],
            points[1]
        );


    const right =
        pointDistance(
            points[1],
            points[2]
        );


    const bottom =
        pointDistance(
            points[2],
            points[3]
        );


    const left =
        pointDistance(
            points[3],
            points[0]
        );


    const horizontal =
        (top + bottom) / 2;


    const vertical =
        (left + right) / 2;


    if (
        horizontal === 0 ||
        vertical === 0
    ) {

        return 0;
    }


    const ratio =
        Math.max(
            horizontal,
            vertical
        )
        /
        Math.min(
            horizontal,
            vertical
        );


    // 透視変形があるので
    // √2を厳密には要求しない
    const error =
        Math.abs(
            Math.log(
                ratio /
                Math.SQRT2
            )
        );


    return Math.exp(
        -1.5 * error
    );
}

// =============================================
// 輪郭群から最も紙らしい四角形を探す
// =============================================

function findBestQuadrilateral(
    cv,
    binaryImage,
    imageWidth,
    imageHeight
) {

    const contours =
        new cv.MatVector();


    const hierarchy =
        new cv.Mat();


    let bestPoints =
        null;

    let bestScore =
        -Infinity;


    const imageArea =
        imageWidth *
        imageHeight;


    try {

        cv.findContours(
            binaryImage,
            contours,
            hierarchy,
            cv.RETR_LIST,
            cv.CHAIN_APPROX_SIMPLE
        );


        for (
            let i = 0;
            i < contours.size();
            i++
        ) {

            const contour =
                contours.get(i);


            try {

                const contourArea =
                    Math.abs(
                        cv.contourArea(
                            contour
                        )
                    );


                const areaRatio =
                    contourArea /
                    imageArea;


                // =========================
                // 小さすぎるものを除外
                // =========================

                if (
                    areaRatio <
                    0.12
                ) {

                    continue;
                }


                // =========================
                // 写真全体そのものを除外
                // =========================

                if (
                    areaRatio >
                    0.96
                ) {

                    continue;
                }


                const perimeter =
                    cv.arcLength(
                        contour,
                        true
                    );


                const epsilonRates =
                    [
                        0.015,
                        0.020,
                        0.025,
                        0.030,
                        0.040,
                        0.050,
                        0.060,
                        0.080
                    ];


                for (
                    const rate
                    of epsilonRates
                ) {

                    const approx =
                        new cv.Mat();


                    try {

                        cv.approxPolyDP(
                            contour,
                            approx,
                            perimeter *
                            rate,
                            true
                        );


                        if (
                            approx.rows !== 4
                        ) {

                            continue;
                        }


                        if (
                            typeof cv.isContourConvex ===
                            "function" &&
                            !cv.isContourConvex(
                                approx
                            )
                        ) {

                            continue;
                        }


                        const data =
                            approx.data32S;


                        let points =
                            [];


                        for (
                            let p = 0;
                            p < 4;
                            p++
                        ) {

                            points.push(
                                {
                                    x:
                                        data[
                                        p * 2
                                        ],

                                    y:
                                        data[
                                        p * 2 + 1
                                        ]
                                }
                            );
                        }


                        points =
                            orderFourPoints(
                                points
                            );


                        const area =
                            quadrilateralArea(
                                points
                            );


                        const quadAreaRatio =
                            area /
                            imageArea;


                        if (
                            quadAreaRatio <
                            0.12 ||
                            quadAreaRatio >
                            0.96
                        ) {

                            continue;
                        }


                        // =========================
                        // 画像外周に張り付いているか
                        // =========================

                        const borderMargin =
                            Math.min(
                                imageWidth,
                                imageHeight
                            ) * 0.015;


                        let borderCornerCount =
                            0;


                        for (
                            const point
                            of points
                        ) {

                            if (
                                point.x <
                                borderMargin ||

                                point.y <
                                borderMargin ||

                                point.x >
                                imageWidth -
                                borderMargin ||

                                point.y >
                                imageHeight -
                                borderMargin
                            ) {

                                borderCornerCount++;
                            }
                        }


                        // 4角全部が画像端なら
                        // 写真そのものの外枠の可能性大
                        if (
                            borderCornerCount >= 3
                        ) {

                            continue;
                        }


                        // =========================
                        // 採点
                        // =========================

                        const angleScore =
                            calculateAngleScore(
                                points
                            );


                        if (
                            angleScore === 0
                        ) {

                            continue;
                        }


                        const ratioScore =
                            calculatePaperRatioScore(
                                points
                            );


                        // 大きさ
                        const sizeScore =
                            Math.min(
                                quadAreaRatio /
                                0.70,
                                1
                            );


                        // =================================
                        // 総合得点
                        //
                        // 面積だけではなく、
                        // ・紙として十分大きい
                        // ・角が長方形らしい
                        // ・A4/B5らしい
                        // を総合評価
                        // =================================

                        const score =
                            sizeScore * 0.50
                            +
                            angleScore * 0.35
                            +
                            ratioScore * 0.15;


                        if (
                            score >
                            bestScore
                        ) {

                            bestScore =
                                score;


                            bestPoints =
                                points.map(
                                    p => ({
                                        x: p.x,
                                        y: p.y
                                    })
                                );
                        }


                        break;

                    } finally {

                        approx.delete();
                    }
                }

            } finally {

                contour.delete();
            }
        }

    } finally {

        contours.delete();

        hierarchy.delete();
    }


    return {
        points:
            bestPoints,

        score:
            bestScore
    };
}

// =============================================
// 四隅位置をサブピクセル精度で補正
// =============================================

function refinePaperCorners(
    cv,
    gray,
    points
) {

    if (
        points === null ||
        points.length !== 4
    ) {

        return points;
    }


    const cornerMat =
        cv.matFromArray(
            4,
            1,
            cv.CV_32FC2,
            [
                points[0].x,
                points[0].y,

                points[1].x,
                points[1].y,

                points[2].x,
                points[2].y,

                points[3].x,
                points[3].y
            ]
        );


    try {

        const winSize =
            new cv.Size(
                15,
                15
            );


        const zeroZone =
            new cv.Size(
                -1,
                -1
            );


        const criteria =
            new cv.TermCriteria(
                cv.TermCriteria_EPS +
                cv.TermCriteria_MAX_ITER,
                40,
                0.01
            );


        cv.cornerSubPix(
            gray,
            cornerMat,
            winSize,
            zeroZone,
            criteria
        );


        const data =
            cornerMat.data32F;


        return orderFourPoints(
            [
                {
                    x: data[0],
                    y: data[1]
                },

                {
                    x: data[2],
                    y: data[3]
                },

                {
                    x: data[4],
                    y: data[5]
                },

                {
                    x: data[6],
                    y: data[7]
                }
            ]
        );

    } catch (error) {

        console.warn(
            "cornerSubPixによる微調整を使用できませんでした。",
            error
        );


        return points;

    } finally {

        cornerMat.delete();
    }
}

// =============================================
// グレースケール画像を
// 暗・中間・明の3グループに分ける
//
// 白い紙と机の明度差を自動取得する
// =============================================

function estimatePaperThreshold(gray) {

    const histogram =
        new Array(256).fill(0);


    const data =
        gray.data;


    for (
        let i = 0;
        i < data.length;
        i++
    ) {

        histogram[
            data[i]
        ]++;
    }


    // 初期中心
    let centers =
        [
            50,
            140,
            220
        ];


    // 1次元k-means
    for (
        let iteration = 0;
        iteration < 20;
        iteration++
    ) {

        const sums =
            [0, 0, 0];

        const counts =
            [0, 0, 0];


        for (
            let value = 0;
            value < 256;
            value++
        ) {

            const count =
                histogram[value];


            if (
                count === 0
            ) {

                continue;
            }


            let bestCluster =
                0;

            let bestDistance =
                Infinity;


            for (
                let k = 0;
                k < 3;
                k++
            ) {

                const distance =
                    Math.abs(
                        value -
                        centers[k]
                    );


                if (
                    distance <
                    bestDistance
                ) {

                    bestDistance =
                        distance;

                    bestCluster =
                        k;
                }
            }


            sums[bestCluster] +=
                value *
                count;

            counts[bestCluster] +=
                count;
        }


        const newCenters =
            centers.slice();


        for (
            let k = 0;
            k < 3;
            k++
        ) {

            if (
                counts[k] > 0
            ) {

                newCenters[k] =
                    sums[k] /
                    counts[k];
            }
        }


        const difference =
            Math.max(
                Math.abs(
                    newCenters[0] -
                    centers[0]
                ),

                Math.abs(
                    newCenters[1] -
                    centers[1]
                ),

                Math.abs(
                    newCenters[2] -
                    centers[2]
                )
            );


        centers =
            newCenters;


        if (
            difference <
            0.1
        ) {

            break;
        }
    }


    centers.sort(
        function (a, b) {

            return a - b;
        }
    );


    const dark =
        centers[0];

    const middle =
        centers[1];

    const bright =
        centers[2];


    console.log(
        "明度グループ:",
        {
            dark,
            middle,
            bright
        }
    );


    // ================================
    // 中間色（机）と明色（紙）の間
    //
    // ちょうど50%ではなく55%にして、
    // 机の照明反射を紙として拾いにくくする
    // ================================

    const threshold =
        middle +
        (
            bright -
            middle
        ) * 0.55;


    console.log(
        "紙抽出しきい値:",
        threshold
    );


    return threshold;
}

// =============================================
// 白い紙領域から四角形を取得
// =============================================

function findPaperFromBrightRegion(
    cv,
    mask,
    imageWidth,
    imageHeight
) {

    const contours =
        new cv.MatVector();


    const hierarchy =
        new cv.Mat();


    let bestPoints =
        null;

    let bestArea =
        0;


    const imageArea =
        imageWidth *
        imageHeight;


    try {

        // 外側の輪郭だけ取得
        cv.findContours(
            mask,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );


        for (
            let i = 0;
            i < contours.size();
            i++
        ) {

            const contour =
                contours.get(i);


            try {

                const area =
                    Math.abs(
                        cv.contourArea(
                            contour
                        )
                    );


                const areaRatio =
                    area /
                    imageArea;


                // =========================
                // 紙として小さすぎる領域は除外
                // =========================

                if (
                    areaRatio <
                    0.12
                ) {

                    continue;
                }


                // =========================
                // 画像全体そのものは除外
                // =========================

                if (
                    areaRatio >
                    0.95
                ) {

                    continue;
                }


                const hull =
                    new cv.Mat();


                try {

                    // 凹凸を消して外周を得る
                    cv.convexHull(
                        contour,
                        hull,
                        false,
                        true
                    );


                    const perimeter =
                        cv.arcLength(
                            hull,
                            true
                        );


                    // =================================
                    // 輪郭を4角形へ近似
                    //
                    // 弱 → 強へ順番に試す
                    // =================================

                    const rates =
                        [
                            0.012,
                            0.015,
                            0.018,
                            0.020,
                            0.022,
                            0.025,
                            0.030,
                            0.040,
                            0.050
                        ];


                    for (
                        const rate
                        of rates
                    ) {

                        const approx =
                            new cv.Mat();


                        try {

                            cv.approxPolyDP(
                                hull,
                                approx,
                                perimeter *
                                rate,
                                true
                            );


                            if (
                                approx.rows !== 4
                            ) {

                                continue;
                            }


                            const raw =
                                approx.data32S;


                            const points =
                                [];


                            for (
                                let p = 0;
                                p < 4;
                                p++
                            ) {

                                points.push(
                                    {
                                        x:
                                            raw[
                                            p * 2
                                            ],

                                        y:
                                            raw[
                                            p * 2 + 1
                                            ]
                                    }
                                );
                            }


                            const ordered =
                                orderFourPoints(
                                    points
                                );


                            const quadArea =
                                quadrilateralArea(
                                    ordered
                                );


                            // 最大の紙候補を採用
                            if (
                                quadArea >
                                bestArea
                            ) {

                                bestArea =
                                    quadArea;


                                bestPoints =
                                    ordered.map(
                                        function (point) {

                                            return {
                                                x:
                                                    point.x,

                                                y:
                                                    point.y
                                            };
                                        }
                                    );
                            }


                            break;

                        } finally {

                            approx.delete();
                        }
                    }

                } finally {

                    hull.delete();
                }

            } finally {

                contour.delete();
            }
        }

    } finally {

        contours.delete();

        hierarchy.delete();
    }


    return bestPoints;
}

// =============================================
// 数値を範囲内に制限
// =============================================

function clamp(value, min, max) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


// =============================================
// 中央値
// =============================================

function median(values) {

    if (values.length === 0) {

        return 0;
    }


    const sorted =
        values.slice().sort(
            function (a, b) {

                return a - b;
            }
        );


    const middle =
        Math.floor(
            sorted.length / 2
        );


    if (
        sorted.length % 2 === 0
    ) {

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;
    }


    return sorted[middle];
}

// =============================================
// Lab画像の小領域平均
// =============================================

function getLabMean(
    lab,
    x,
    y,
    radius = 2
) {

    const centerX =
        Math.round(x);

    const centerY =
        Math.round(y);


    let sumL = 0;
    let sumA = 0;
    let sumB = 0;

    let count = 0;


    for (
        let dy = -radius;
        dy <= radius;
        dy++
    ) {

        const py =
            centerY + dy;


        if (
            py < 0 ||
            py >= lab.rows
        ) {

            continue;
        }


        for (
            let dx = -radius;
            dx <= radius;
            dx++
        ) {

            const px =
                centerX + dx;


            if (
                px < 0 ||
                px >= lab.cols
            ) {

                continue;
            }


            const index =
                (
                    py *
                    lab.cols +
                    px
                ) * 3;


            sumL +=
                lab.data[
                index
                ];


            sumA +=
                lab.data[
                index + 1
                ];


            sumB +=
                lab.data[
                index + 2
                ];


            count++;
        }
    }


    if (
        count === 0
    ) {

        return null;
    }


    return {

        l:
            sumL /
            count,

        a:
            sumA /
            count,

        b:
            sumB /
            count
    };
}

// =============================================
// Lab色差
// =============================================

function labColorDistance(
    color1,
    color2
) {

    if (
        color1 === null ||
        color2 === null
    ) {

        return 0;
    }


    const dL =
        color1.l -
        color2.l;


    const dA =
        color1.a -
        color2.a;


    const dB =
        color1.b -
        color2.b;


    // 明度を少し重視
    return Math.sqrt(
        dL * dL +
        0.6 * dA * dA +
        0.6 * dB * dB
    );
}

// =============================================
// エッジ強度取得
// =============================================

function getEdgeStrength(
    edgeMat,
    x,
    y,
    radius = 2
) {

    const centerX =
        Math.round(x);

    const centerY =
        Math.round(y);


    let maxValue = 0;


    for (
        let dy = -radius;
        dy <= radius;
        dy++
    ) {

        const py =
            centerY + dy;


        if (
            py < 0 ||
            py >= edgeMat.rows
        ) {

            continue;
        }


        for (
            let dx = -radius;
            dx <= radius;
            dx++
        ) {

            const px =
                centerX + dx;


            if (
                px < 0 ||
                px >= edgeMat.cols
            ) {

                continue;
            }


            const value =
                edgeMat.data[
                py *
                edgeMat.cols +
                px
                ];


            if (
                value >
                maxValue
            ) {

                maxValue =
                    value;
            }
        }
    }


    return maxValue;
}

// =============================================
// 1本の紙端を
// Lab色差＋エッジで精密化
// =============================================

function refinePaperEdge(
    lab,
    edgeMat,
    point1,
    point2,
    searchRadius
) {

    const dx =
        point2.x -
        point1.x;


    const dy =
        point2.y -
        point1.y;


    const length =
        Math.sqrt(
            dx * dx +
            dy * dy
        );


    if (
        length < 10
    ) {

        return {
            p1: point1,
            p2: point2,
            offset: 0
        };
    }


    // 辺方向の単位ベクトル
    const tx =
        dx /
        length;


    const ty =
        dy /
        length;


    // 辺に垂直な方向
    const nx =
        -ty;


    const ny =
        tx;


    // 紙側・背景側の色を取る距離
    const sampleGap =
        Math.max(
            4,
            Math.min(
                10,
                Math.round(
                    length *
                    0.01
                )
            )
        );


    const numberOfSamples =
        30;


    let bestOffset =
        0;

    let bestScore =
        -Infinity;


    // =========================================
    // 辺を法線方向に少しずつずらして調査
    // =========================================

    for (
        let offset = -searchRadius;
        offset <= searchRadius;
        offset++
    ) {

        const colorScores =
            [];

        const edgeScores =
            [];


        // =====================================
        // 辺上の多数の点で調査
        //
        // 両端10%は角丸・影の影響があるので除外
        // =====================================

        for (
            let i = 0;
            i < numberOfSamples;
            i++
        ) {

            const ratio =
                0.10 +
                0.80 *
                (
                    i /
                    (
                        numberOfSamples -
                        1
                    )
                );


            const baseX =
                point1.x +
                dx *
                ratio +
                nx *
                offset;


            const baseY =
                point1.y +
                dy *
                ratio +
                ny *
                offset;


            // 境界の片側
            const colorA =
                getLabMean(
                    lab,
                    baseX +
                    nx *
                    sampleGap,
                    baseY +
                    ny *
                    sampleGap,
                    2
                );


            // 境界の反対側
            const colorB =
                getLabMean(
                    lab,
                    baseX -
                    nx *
                    sampleGap,
                    baseY -
                    ny *
                    sampleGap,
                    2
                );


            const colorDifference =
                labColorDistance(
                    colorA,
                    colorB
                );


            colorScores.push(
                colorDifference
            );


            const edgeStrength =
                getEdgeStrength(
                    edgeMat,
                    baseX,
                    baseY,
                    2
                );


            edgeScores.push(
                edgeStrength /
                255
            );
        }


        // =====================================
        // 中央値を使う
        //
        // 文字やパンチ穴などの局所的なノイズを
        // 受けにくくする
        // =====================================

        const colorScore =
            median(
                colorScores
            );


        const edgeScore =
            median(
                edgeScores
            );


        // =====================================
        // 総合評価
        //
        // 色差を主体にし、
        // Cannyを補助として使用
        // =====================================

        let score =
            colorScore
            +
            edgeScore *
            25;


        // =====================================
        // 粗検出位置から遠く離れるほど
        // わずかに減点
        //
        // 全然違う境界へ飛ぶことを防ぐ
        // =====================================

        score -=
            Math.abs(
                offset
            ) * 0.08;


        if (
            score >
            bestScore
        ) {

            bestScore =
                score;

            bestOffset =
                offset;
        }
    }


    return {

        p1: {
            x:
                point1.x +
                nx *
                bestOffset,

            y:
                point1.y +
                ny *
                bestOffset
        },

        p2: {
            x:
                point2.x +
                nx *
                bestOffset,

            y:
                point2.y +
                ny *
                bestOffset
        },

        offset:
            bestOffset,

        score:
            bestScore
    };
}

// =============================================
// 2直線の交点
// =============================================

function getLineIntersection(
    line1,
    line2
) {

    const x1 =
        line1.p1.x;

    const y1 =
        line1.p1.y;


    const x2 =
        line1.p2.x;

    const y2 =
        line1.p2.y;


    const x3 =
        line2.p1.x;

    const y3 =
        line2.p1.y;


    const x4 =
        line2.p2.x;

    const y4 =
        line2.p2.y;


    const denominator =
        (
            x1 - x2
        ) *
        (
            y3 - y4
        )
        -
        (
            y1 - y2
        ) *
        (
            x3 - x4
        );


    if (
        Math.abs(
            denominator
        ) <
        0.0001
    ) {

        return null;
    }


    const a =
        x1 * y2 -
        y1 * x2;


    const b =
        x3 * y4 -
        y3 * x4;


    const x =
        (
            a *
            (
                x3 - x4
            )
            -
            (
                x1 - x2
            ) *
            b
        )
        /
        denominator;


    const y =
        (
            a *
            (
                y3 - y4
            )
            -
            (
                y1 - y2
            ) *
            b
        )
        /
        denominator;


    return {
        x: x,
        y: y
    };
}

// =============================================
// 四角形全体を
// 色差＋エッジで精密化
// =============================================

function refineQuadrilateral(
    cv,
    src,
    gray,
    roughPoints
) {

    let rgb = null;
    let lab = null;
    let edges = null;


    try {

        rgb =
            new cv.Mat();


        lab =
            new cv.Mat();


        edges =
            new cv.Mat();


        // =====================================
        // RGBA → RGB → Lab
        // =====================================

        cv.cvtColor(
            src,
            rgb,
            cv.COLOR_RGBA2RGB
        );


        cv.cvtColor(
            rgb,
            lab,
            cv.COLOR_RGB2Lab
        );


        // =====================================
        // 精密化用Canny
        //
        // dilateしていない元の細いエッジを使う
        // =====================================

        cv.Canny(
            gray,
            edges,
            25,
            80
        );


        // =====================================
        // 探索距離
        // =====================================

        const searchRadius =
            Math.round(
                clamp(
                    Math.min(
                        src.cols,
                        src.rows
                    ) *
                    0.035,
                    12,
                    45
                )
            );


        // roughPoints は
        //
        // 0 左上
        // 1 右上
        // 2 右下
        // 3 左下
        // =====================================


        const top =
            refinePaperEdge(
                lab,
                edges,
                roughPoints[0],
                roughPoints[1],
                searchRadius
            );


        const right =
            refinePaperEdge(
                lab,
                edges,
                roughPoints[1],
                roughPoints[2],
                searchRadius
            );


        const bottom =
            refinePaperEdge(
                lab,
                edges,
                roughPoints[2],
                roughPoints[3],
                searchRadius
            );


        const left =
            refinePaperEdge(
                lab,
                edges,
                roughPoints[3],
                roughPoints[0],
                searchRadius
            );


        console.log(
            "辺補正量:",
            {
                top:
                    top.offset,

                right:
                    right.offset,

                bottom:
                    bottom.offset,

                left:
                    left.offset
            }
        );


        // =====================================
        // 4本の直線の交点
        // =====================================

        const topLeft =
            getLineIntersection(
                top,
                left
            );


        const topRight =
            getLineIntersection(
                top,
                right
            );


        const bottomRight =
            getLineIntersection(
                bottom,
                right
            );


        const bottomLeft =
            getLineIntersection(
                bottom,
                left
            );


        if (
            topLeft === null ||
            topRight === null ||
            bottomRight === null ||
            bottomLeft === null
        ) {

            return roughPoints;
        }


        let refined =
            [
                topLeft,
                topRight,
                bottomRight,
                bottomLeft
            ];


        // =====================================
        // 極端に画像外へ飛ばないよう制限
        // =====================================

        refined =
            refined.map(
                function (point) {

                    return {

                        x:
                            clamp(
                                point.x,
                                0,
                                src.cols - 1
                            ),

                        y:
                            clamp(
                                point.y,
                                0,
                                src.rows - 1
                            )
                    };
                }
            );


        return refined;

    } catch (error) {

        console.warn(
            "色差による四隅精密化に失敗:",
            error
        );


        // 精密化が失敗しても
        // これまでの粗検出結果を使える
        return roughPoints;

    } finally {

        if (
            rgb !== null
        ) {

            rgb.delete();
        }


        if (
            lab !== null
        ) {

            lab.delete();
        }


        if (
            edges !== null
        ) {

            edges.delete();
        }
    }
}

// =============================================
// 標準的なドキュメントスキャナ方式
//
// Gray
// ↓
// Gaussian Blur
// ↓
// Canny
// ↓
// Morphological Close
// ↓
// findContours
// ↓
// approxPolyDP
// ↓
// 最大の4角形
// =============================================

async function autoDetectPaperCorners() {

    if (cropSourceCanvas === null) {

        return false;
    }


    const cv =
        await getOpenCv();


    // =========================================
    // 検出用画像
    // =========================================

    const detectionCanvas =
        document.createElement("canvas");


    const originalWidth =
        cropSourceCanvas.width;

    const originalHeight =
        cropSourceCanvas.height;


    // 少し解像度を上げる
    // 紙の細い境界を残しやすくする
    const maxDetectionSize =
        1600;


    const scale =
        Math.min(
            1,
            maxDetectionSize /
            Math.max(
                originalWidth,
                originalHeight
            )
        );


    detectionCanvas.width =
        Math.max(
            1,
            Math.round(
                originalWidth *
                scale
            )
        );


    detectionCanvas.height =
        Math.max(
            1,
            Math.round(
                originalHeight *
                scale
            )
        );


    const context =
        detectionCanvas.getContext(
            "2d"
        );


    context.drawImage(
        cropSourceCanvas,
        0,
        0,
        detectionCanvas.width,
        detectionCanvas.height
    );


    // =========================================
    // OpenCV変数
    // =========================================

    let src = null;
    let gray = null;
    let blurred = null;

    let kernel = null;


    try {

        src =
            cv.imread(
                detectionCanvas
            );


        gray =
            new cv.Mat();


        blurred =
            new cv.Mat();


        // =====================================
        // ① グレースケール
        // =====================================

        cv.cvtColor(
            src,
            gray,
            cv.COLOR_RGBA2GRAY
        );


        // =====================================
        // ② Gaussian Blur
        // =====================================

        cv.GaussianBlur(
            gray,
            blurred,
            new cv.Size(
                5,
                5
            ),
            0
        );


        // =====================================
        // Cannyの条件
        //
        // 低め → 標準 → 高め
        // の3種類を試す
        // =====================================

        const cannySettings =
            [
                {
                    low: 10,
                    high: 30
                },

                {
                    low: 20,
                    high: 60
                },

                {
                    low: 30,
                    high: 100
                },

                {
                    low: 50,
                    high: 150
                }
            ];


        // =====================================
        // approxPolyDPの近似率
        // =====================================

        const epsilonRates =
            [
                0.015,
                0.020,
                0.025,
                0.030,
                0.040,
                0.050
            ];


        // =====================================
        // 切れたエッジをつなぐカーネル
        // =====================================

        kernel =
            cv.getStructuringElement(
                cv.MORPH_RECT,
                new cv.Size(
                    5,
                    5
                )
            );


        const imageArea =
            detectionCanvas.width *
            detectionCanvas.height;


        let bestPoints =
            null;


        let bestArea =
            0;


        // =====================================
        // Canny条件を順番に試す
        // =====================================

        for (
            const cannySetting
            of cannySettings
        ) {

            let edged = null;
            let connected = null;
            let contours = null;
            let hierarchy = null;


            try {

                edged =
                    new cv.Mat();


                connected =
                    new cv.Mat();


                // =============================
                // ③ Canny
                // =============================

                cv.Canny(
                    blurred,
                    edged,
                    cannySetting.low,
                    cannySetting.high
                );


                // =================================
                // 紙の辺が途中で切れているため、
                // Cannyエッジを少し太らせて接続する
                // =================================

                cv.dilate(
                    edged,
                    connected,
                    kernel,
                    new cv.Point(
                        -1,
                        -1
                    ),
                    5
                );


                // =============================
                // ⑤ 輪郭検出
                // =============================

                contours =
                    new cv.MatVector();


                hierarchy =
                    new cv.Mat();


                cv.findContours(
                    connected,
                    contours,
                    hierarchy,
                    cv.RETR_LIST,
                    cv.CHAIN_APPROX_SIMPLE
                );


                // =============================
                // 輪郭を面積順に並べる
                // =============================

                const contourInfo =
                    [];


                for (
                    let i = 0;
                    i < contours.size();
                    i++
                ) {

                    const contour =
                        contours.get(i);


                    const area =
                        Math.abs(
                            cv.contourArea(
                                contour
                            )
                        );


                    contourInfo.push(
                        {
                            index: i,
                            area: area
                        }
                    );


                    contour.delete();
                }


                contourInfo.sort(
                    function (a, b) {

                        return (
                            b.area -
                            a.area
                        );
                    }
                );


                // =============================
                // 大きい輪郭から最大30個確認
                // =============================

                const checkCount =
                    Math.min(
                        30,
                        contourInfo.length
                    );


                for (
                    let i = 0;
                    i < checkCount;
                    i++
                ) {

                    const info =
                        contourInfo[i];


                    // 写真の5%未満は無視
                    if (
                        info.area <
                        imageArea *
                        0.05
                    ) {

                        continue;
                    }


                    // ほぼ画像全体なら除外
                    if (
                        info.area >
                        imageArea *
                        0.98
                    ) {

                        continue;
                    }


                    const contour =
                        contours.get(
                            info.index
                        );


                    try {

                        const perimeter =
                            cv.arcLength(
                                contour,
                                true
                            );


                        // =====================
                        // 近似率を複数試す
                        // =====================

                        for (
                            const epsilonRate
                            of epsilonRates
                        ) {

                            const approx =
                                new cv.Mat();


                            try {

                                cv.approxPolyDP(
                                    contour,
                                    approx,
                                    epsilonRate *
                                    perimeter,
                                    true
                                );


                                if (
                                    approx.rows !== 4
                                ) {

                                    continue;
                                }


                                // 凸四角形のみ
                                if (
                                    typeof cv.isContourConvex ===
                                    "function"
                                ) {

                                    if (
                                        !cv.isContourConvex(
                                            approx
                                        )
                                    ) {

                                        continue;
                                    }
                                }


                                // =================
                                // 4頂点を取得
                                // =================

                                const data =
                                    approx.data32S;


                                const points =
                                    [];


                                for (
                                    let p = 0;
                                    p < 4;
                                    p++
                                ) {

                                    points.push(
                                        {
                                            x:
                                                data[
                                                p * 2
                                                ],

                                            y:
                                                data[
                                                p * 2 +
                                                1
                                                ]
                                        }
                                    );
                                }


                                const orderedPoints =
                                    orderFourPoints(
                                        points
                                    );


                                // =================
                                // 四角形面積
                                // =================

                                let quadArea =
                                    0;


                                for (
                                    let p = 0;
                                    p < 4;
                                    p++
                                ) {

                                    const q =
                                        (
                                            p + 1
                                        ) % 4;


                                    quadArea +=
                                        orderedPoints[p].x *
                                        orderedPoints[q].y;


                                    quadArea -=
                                        orderedPoints[q].x *
                                        orderedPoints[p].y;
                                }


                                quadArea =
                                    Math.abs(
                                        quadArea /
                                        2
                                    );


                                // 小さすぎるものは除外
                                if (
                                    quadArea <
                                    imageArea *
                                    0.05
                                ) {

                                    continue;
                                }


                                // =================
                                // 今までで最大なら採用
                                // =================

                                if (
                                    quadArea >
                                    bestArea
                                ) {

                                    bestArea =
                                        quadArea;


                                    bestPoints =
                                        orderedPoints.map(
                                            function (point) {

                                                return {
                                                    x:
                                                        point.x,

                                                    y:
                                                        point.y
                                                };
                                            }
                                        );
                                }


                                // この輪郭では4点が
                                // 見つかったので終了
                                break;

                            } finally {

                                approx.delete();
                            }
                        }

                    } finally {

                        contour.delete();
                    }
                }

            } finally {

                if (
                    edged !== null
                ) {

                    edged.delete();
                }


                if (
                    connected !== null
                ) {

                    connected.delete();
                }


                if (
                    contours !== null
                ) {

                    contours.delete();
                }


                if (
                    hierarchy !== null
                ) {

                    hierarchy.delete();
                }
            }
        }


        // =====================================
        // 4角形が見つからなかった
        // =====================================

        if (
            bestPoints === null
        ) {

            console.log(
                "4頂点の紙候補が見つかりませんでした。"
            );


            return false;
        }


        console.log(
            "検出した紙:",
            bestPoints
        );


        console.log(
            "紙候補面積率:",
            bestArea /
            imageArea
        );

        // =====================================
        // Lab色差＋Cannyによって
        // 四辺位置を精密化
        // =====================================

        bestPoints =
            refineQuadrilateral(
                cv,
                src,
                gray,
                bestPoints
            );


        console.log(
            "色差補正後:",
            bestPoints
        );


        // =====================================
        // 検出Canvas座標
        // ↓
        // 編集Canvas座標
        // =====================================

        const scaleX =
            cropCanvas.width /
            detectionCanvas.width;


        const scaleY =
            cropCanvas.height /
            detectionCanvas.height;


        cropPoints =
            bestPoints.map(
                function (point) {

                    return {

                        x:
                            point.x *
                            scaleX,

                        y:
                            point.y *
                            scaleY
                    };
                }
            );


        drawCropEditor();


        return true;

    } finally {

        if (
            src !== null
        ) {

            src.delete();
        }


        if (
            gray !== null
        ) {

            gray.delete();
        }


        if (
            blurred !== null
        ) {

            blurred.delete();
        }


        if (
            kernel !== null
        ) {

            kernel.delete();
        }
    }
}

// =============================================
// 四隅自動検出ボタン
// =============================================

autoDetectCropButton.addEventListener(
    "click",
    async function () {

        if (
            cropSourceCanvas === null
        ) {

            return;
        }


        autoDetectCropButton.disabled =
            true;

        applyCropButton.disabled =
            true;


        cropStatus.textContent =
            "紙の四隅を自動検出しています...";


        try {

            const detected =
                await autoDetectPaperCorners();


            if (detected) {

                cropStatus.textContent =
                    "紙の四隅を検出しました。" +
                    "必要であれば丸を動かして修正してください。";

            } else {

                cropStatus.textContent =
                    "紙の四隅を自動検出できませんでした。" +
                    "丸を手動で紙の四隅に合わせてください。";
            }

        } catch (error) {

            console.error(
                error
            );


            cropStatus.textContent =
                "自動検出中にエラーが発生しました。";


            alert(
                "四隅の自動検出中にエラーが発生しました。\n\n" +
                error.message
            );

        } finally {

            autoDetectCropButton.disabled =
                false;

            applyCropButton.disabled =
                false;
        }
    }
);

// =============================================
// 2点間距離
// =============================================

function pointDistance(
    a,
    b
) {

    const dx =
        a.x - b.x;

    const dy =
        a.y - b.y;


    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}


// =============================================
// OpenCV読み込み待ち
// =============================================

async function getOpenCv() {

    const startTime =
        Date.now();


    while (
        Date.now() - startTime <
        30000
    ) {

        // 読み込み失敗
        if (
            window.openCvLoadFailed
        ) {

            throw new Error(
                "OpenCV.jsの読み込みまたは初期化に失敗しました。"
            );
        }


        // 読み込み完了
        if (
            window.openCvReady &&
            window.cv &&
            window.cv.Mat
        ) {

            return window.cv;
        }


        await new Promise(
            function (resolve) {

                setTimeout(
                    resolve,
                    100
                );
            }
        );
    }


    throw new Error(
        "OpenCV.jsの初期化が30秒以内に完了しませんでした。"
    );
}


// =============================================
// 補正適用
// =============================================

applyCropButton.addEventListener(
    "click",
    async function () {

        if (
            cropEditingIndex < 0 ||
            cropSourceCanvas === null
        ) {

            return;
        }


        if (
            !isValidQuadrilateral(
                cropPoints
            )
        ) {

            alert(
                "四隅の位置が交差しています。\n" +
                "左上・右上・右下・左下の順になるよう調整してください。"
            );

            return;
        }


        applyCropButton.disabled =
            true;

        resetCropButton.disabled =
            true;

        cancelCropButton.disabled =
            true;


        cropStatus.textContent =
            "補正処理中です...";


        let src = null;
        let dst = null;
        let srcTri = null;
        let dstTri = null;
        let matrix = null;


        try {

            const cv =
                await getOpenCv();


            // =========================
            // 編集画面座標
            // ↓
            // 元画像座標
            // =========================

            const scaleX =
                cropSourceCanvas.width /
                cropCanvas.width;

            const scaleY =
                cropSourceCanvas.height /
                cropCanvas.height;


            const sourcePoints =
                cropPoints.map(
                    function (point) {

                        return {

                            x:
                                point.x *
                                scaleX,

                            y:
                                point.y *
                                scaleY
                        };
                    }
                );


            const top =
                pointDistance(
                    sourcePoints[0],
                    sourcePoints[1]
                );


            const right =
                pointDistance(
                    sourcePoints[1],
                    sourcePoints[2]
                );


            const bottom =
                pointDistance(
                    sourcePoints[2],
                    sourcePoints[3]
                );


            const left =
                pointDistance(
                    sourcePoints[3],
                    sourcePoints[0]
                );


            const horizontal =
                Math.max(
                    top,
                    bottom
                );


            const vertical =
                Math.max(
                    left,
                    right
                );


            // A4/B5はほぼ1 : √2
            const paperRatio =
                Math.SQRT2;


            let outputWidth;
            let outputHeight;


            // =========================
            // 縦向き
            // =========================

            if (
                vertical >=
                horizontal
            ) {

                outputWidth =
                    Math.max(
                        horizontal,
                        vertical /
                        paperRatio
                    );


                outputHeight =
                    outputWidth *
                    paperRatio;

            } else {

                // =====================
                // 横向き
                // =====================

                outputHeight =
                    Math.max(
                        vertical,
                        horizontal /
                        paperRatio
                    );


                outputWidth =
                    outputHeight *
                    paperRatio;
            }


            outputWidth =
                Math.round(
                    outputWidth
                );

            outputHeight =
                Math.round(
                    outputHeight
                );


            // =========================
            // メモリ消費を抑えるため
            // 長辺を最大3508pxに制限
            // =========================

            const maxLongEdge =
                3508;


            const longEdge =
                Math.max(
                    outputWidth,
                    outputHeight
                );


            if (
                longEdge >
                maxLongEdge
            ) {

                const reduction =
                    maxLongEdge /
                    longEdge;


                outputWidth =
                    Math.round(
                        outputWidth *
                        reduction
                    );


                outputHeight =
                    Math.round(
                        outputHeight *
                        reduction
                    );
            }


            // =========================
            // OpenCVへ読み込み
            // =========================

            src =
                cv.imread(
                    cropSourceCanvas
                );


            dst =
                new cv.Mat();


            srcTri =
                cv.matFromArray(
                    4,
                    1,
                    cv.CV_32FC2,
                    [
                        // 左上
                        sourcePoints[0].x,
                        sourcePoints[0].y,

                        // 右上
                        sourcePoints[1].x,
                        sourcePoints[1].y,

                        // 右下
                        sourcePoints[2].x,
                        sourcePoints[2].y,

                        // 左下
                        sourcePoints[3].x,
                        sourcePoints[3].y
                    ]
                );


            dstTri =
                cv.matFromArray(
                    4,
                    1,
                    cv.CV_32FC2,
                    [
                        0,
                        0,

                        outputWidth - 1,
                        0,

                        outputWidth - 1,
                        outputHeight - 1,

                        0,
                        outputHeight - 1
                    ]
                );


            matrix =
                cv.getPerspectiveTransform(
                    srcTri,
                    dstTri
                );


            const outputSize =
                new cv.Size(
                    outputWidth,
                    outputHeight
                );


            cv.warpPerspective(
                src,
                dst,
                matrix,
                outputSize,
                cv.INTER_LINEAR,
                cv.BORDER_CONSTANT,
                new cv.Scalar(
                    255,
                    255,
                    255,
                    255
                )
            );


            // =========================================
            // 射影変換結果
            // =========================================

            const outputCanvas =
                document.createElement(
                    "canvas"
                );


            outputCanvas.width =
                outputWidth;

            outputCanvas.height =
                outputHeight;


            cv.imshow(
                outputCanvas,
                dst
            );


            // =========================================
            // 選択フィルターを取得
            // =========================================

            const selectedFilterMode =
                cropFilterMode.value;


            console.log(
                "選択されたフィルター:",
                selectedFilterMode
            );


            // =========================================
            // フィルター適用
            // =========================================

            const filteredCanvas =
                await applyFilterToCanvas(
                    outputCanvas,
                    selectedFilterMode
                );


            // =========================================
            // ★重要
            //
            // 保存するのは
            // outputCanvas ではなく
            // filteredCanvas
            // =========================================

            const correctedBlob =
                await canvasToJpegBlob(
                    filteredCanvas,
                    0.95
                );


            pages[
                cropEditingIndex
            ].correctedBlob =
                correctedBlob;

            pages[
                cropEditingIndex
            ].autoStatus =
                "manual";

            pages[
                cropEditingIndex
            ].filterMode =
                selectedFilterMode;


            pages[
                cropEditingIndex
            ].rotation =
                0;


            invalidateGeneratedPdf();

            closeCropEditor();

            showPreviews();

        } catch (error) {

            console.error(error);


            cropStatus.textContent =
                "補正に失敗しました。";


            alert(
                "四隅補正中にエラーが発生しました。\n\n" +
                error.message
            );

        } finally {

            // OpenCVメモリ解放

            if (src !== null) {

                src.delete();
            }


            if (dst !== null) {

                dst.delete();
            }


            if (srcTri !== null) {

                srcTri.delete();
            }


            if (dstTri !== null) {

                dstTri.delete();
            }


            if (matrix !== null) {

                matrix.delete();
            }


            applyCropButton.disabled =
                false;

            resetCropButton.disabled =
                false;

            cancelCropButton.disabled =
                false;
        }
    }
);


// =============================================
// PDF作成
// =============================================

createPdfButton.addEventListener(
    "click",
    async function () {

        if (
            pages.length === 0
        ) {

            alert(
                "写真を選択してください。"
            );

            return;
        }


        createPdfButton.disabled =
            true;

        createPdfButton.textContent =
            "PDFを作成中...";


        try {

            const {
                PDFDocument
            } = PDFLib;


            const pdfDoc =
                await PDFDocument.create();


            const selectedPaper =
                document.querySelector(
                    'input[name="paperSize"]:checked'
                ).value;


            let pageWidth;
            let pageHeight;


            if (
                selectedPaper === "A4"
            ) {

                pageWidth =
                    595.28;

                pageHeight =
                    841.89;

            } else {

                pageWidth =
                    515.91;

                pageHeight =
                    728.50;
            }


            // =========================
            // 各画像
            // =========================

            for (
                let i = 0;
                i < pages.length;
                i++
            ) {

                const jpegBytes =
                    await pageToJpegBytes(
                        pages[i]
                    );


                const pdfImage =
                    await pdfDoc.embedJpg(
                        jpegBytes
                    );


                const page =
                    pdfDoc.addPage(
                        [
                            pageWidth,
                            pageHeight
                        ]
                    );


                const scale =
                    Math.min(
                        pageWidth /
                        pdfImage.width,

                        pageHeight /
                        pdfImage.height
                    );


                const drawWidth =
                    pdfImage.width *
                    scale;


                const drawHeight =
                    pdfImage.height *
                    scale;


                const x =
                    (
                        pageWidth -
                        drawWidth
                    ) / 2;


                const y =
                    (
                        pageHeight -
                        drawHeight
                    ) / 2;


                page.drawImage(
                    pdfImage,
                    {
                        x: x,
                        y: y,

                        width:
                            drawWidth,

                        height:
                            drawHeight
                    }
                );
            }


            // =========================
            // PDF生成
            // =========================

            const pdfBytes =
                await pdfDoc.save();


            generatedPdfBlob =
                new Blob(
                    [pdfBytes],
                    {
                        type:
                            "application/pdf"
                    }
                );


            if (
                pdfBlobUrl !== null
            ) {

                URL.revokeObjectURL(
                    pdfBlobUrl
                );
            }


            pdfBlobUrl =
                URL.createObjectURL(
                    generatedPdfBlob
                );


            pdfPreview.src =
                pdfBlobUrl;


            pdfResultSection.style.display =
                "block";


            pdfResultSection.scrollIntoView(
                {
                    behavior:
                        "smooth"
                }
            );

        } catch (error) {

            console.error(error);


            alert(
                "PDFの作成中にエラーが発生しました。\n\n" +
                error.message
            );

        } finally {

            createPdfButton.disabled =
                false;

            createPdfButton.textContent =
                "PDFを作成";
        }
    }
);


// =============================================
// PDF保存
// =============================================

savePdfButton.addEventListener(
    "click",
    async function () {

        if (!generatedPdfBlob) {

            alert(
                "先にPDFを作成してください。"
            );

            return;

        }


        let fileName =
            fileNameInput.value.trim();


        if (!fileName) {

            fileName =
                "RectiScan";

        }


        if (
            !fileName
                .toLowerCase()
                .endsWith(".pdf")
        ) {

            fileName += ".pdf";

        }


        const pdfFile =
            new File(
                [generatedPdfBlob],
                fileName,
                {
                    type:
                        "application/pdf"
                }
            );


        // =========================
        // iPhone等
        // =========================

        if (
            navigator.canShare &&
            navigator.canShare({
                files: [pdfFile]
            })
        ) {

            try {

                await navigator.share({

                    files: [
                        pdfFile
                    ],

                    title:
                        fileName

                });


                return;

            }
            catch (error) {

                if (
                    error.name ===
                    "AbortError"
                ) {

                    return;

                }


                console.error(
                    error
                );

            }

        }


        // =========================
        // PC等へのフォールバック
        // =========================

        const url =
            URL.createObjectURL(
                generatedPdfBlob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;

        link.download =
            fileName;


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        setTimeout(
            function () {

                URL.revokeObjectURL(
                    url
                );

            },
            1000
        );

    }
);