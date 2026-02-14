-- Tạo ScreenGui
local player = game.Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Parent = player:WaitForChild("PlayerGui")

-- Tạo khung (Frame) làm nền
local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 300, 0, 150)  -- Rộng 300, cao 150
frame.Position = UDim2.new(0.5, -150, 0.5, -75)  -- Căn giữa màn hình
frame.BackgroundColor3 = Color3.new(0.2, 0.2, 0.2)  -- Màu xám đen
frame.BackgroundTransparency = 0.3  -- Hơi trong suốt
frame.BorderSizePixel = 2
frame.BorderColor3 = Color3.new(1, 0.5, 0)  -- Viền màu cam
frame.Active = true
frame.Draggable = true  -- Có thể kéo thả
frame.Parent = gui

-- Tạo text để hiển thị chữ
local textLabel = Instance.new("TextLabel")
textLabel.Size = UDim2.new(1, 0, 1, 0)  -- Full khung
textLabel.BackgroundTransparency = 1  -- Trong suốt
textLabel.Text = "có cái đb"  -- Nội dung chữ
textLabel.TextColor3 = Color3.new(1, 1, 1)  -- Màu trắng
textLabel.TextScaled = true  -- Tự động co giãn chữ
textLabel.Font = Enum.Font.SourceSansBold  -- Font chữ đậm
textLabel.Parent = frame

-- Thêm hiệu ứng đẹp mắt
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 10)  -- Bo góc 10 pixel
corner.Parent = frame

-- Thêm shadow (bóng đổ) cho đẹp
local shadow = Instance.new("ImageLabel")
shadow.Size = UDim2.new(1, 20, 1, 20)
shadow.Position = UDim2.new(0, -10, 0, -10)
shadow.BackgroundTransparency = 1
shadow.Image = "rbxassetid://1316045217"  -- Asset shadow
shadow.ImageColor3 = Color3.new(0, 0, 0)
shadow.ImageTransparency = 0.5
shadow.Parent = frame
shadow.ZIndex = -1

-- Thông báo khi tạo thành công
print("Đã tạo bảng 'có cái đb' thành công!")