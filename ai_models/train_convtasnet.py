import torch
import torch.nn as nn
import torch.nn.functional as F

class DepthwiseSeparableConv(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride, padding, dilation):
        super(DepthwiseSeparableConv, self).__init__()
        # Depthwise
        self.depthwise = nn.Conv1d(in_channels, in_channels, kernel_size, 
                                   stride=stride, padding=padding, 
                                   dilation=dilation, groups=in_channels, 
                                   bias=False)
        # Pointwise
        self.pointwise = nn.Conv1d(in_channels, out_channels, 1, bias=False)

    def forward(self, x):
        return self.pointwise(self.depthwise(x))

class TCNBlock(nn.Module):
    def __init__(self, in_channels, hidden_channels, kernel_size, dilation):
        super(TCNBlock, self).__init__()
        # Causal padding = (kernel_size - 1) * dilation
        padding = (kernel_size - 1) * dilation
        
        self.conv1x1 = nn.Conv1d(in_channels, hidden_channels, 1)
        self.prelu1 = nn.PReLU()
        self.norm1 = nn.GroupNorm(1, hidden_channels)
        
        self.dsconv = DepthwiseSeparableConv(hidden_channels, hidden_channels, 
                                           kernel_size, stride=1, 
                                           padding=padding, dilation=dilation)
        self.prelu2 = nn.PReLU()
        self.norm2 = nn.GroupNorm(1, hidden_channels)
        
        self.res_conv = nn.Conv1d(hidden_channels, in_channels, 1)
        self.skip_conv = nn.Conv1d(hidden_channels, in_channels, 1)

    def forward(self, x):
        residual = x
        x = self.norm1(self.prelu1(self.conv1x1(x)))
        # For causality, we must trim the output of the padded conv
        # Since we use padding=(k-1)*d, we trim the last 'padding' samples
        x = self.dsconv(x)
        if self.dsconv.depthwise.padding[0] > 0:
            x = x[:, :, :-self.dsconv.depthwise.padding[0]]
            
        x = self.norm2(self.prelu2(x))
        return residual + self.res_conv(x), self.skip_conv(x)

class CausalConvTasNet(nn.Module):
    def __init__(self, N=128, L=16, B=128, H=256, P=3, X=8, R=3):
        super(CausalConvTasNet, self).__init__()
        # N: Number of filters in autoencoder
        # L: Length of the filters (kernel size)
        # B: Number of channels in bottleneck and residual paths
        # H: Number of channels in convolutional blocks
        # P: Kernel size in convolutional blocks
        # X: Number of convolutional blocks in each repeat
        # R: Number of repeats
        
        self.encoder = nn.Conv1d(1, N, L, stride=L//2, padding=0)
        self.bottleneck = nn.Conv1d(N, B, 1)
        
        self.tcn = nn.ModuleList()
        for r in range(R):
            for x in range(X):
                dilation = 2**x
                self.tcn.append(TCNBlock(B, H, P, dilation))
        
        self.mask_conv = nn.Conv1d(B, N, 1)
        # Activation for audio mask (strictly 0 to 1)
        self.mask_activation = nn.Sigmoid()
        
        self.decoder = nn.ConvTranspose1d(N, 1, L, stride=L//2, padding=0)

    def forward(self, x):
        # x: [Batch, 1, Time]
        e = self.encoder(x)
        b = self.bottleneck(e)
        
        skip_connection = 0
        for block in self.tcn:
            b, skip = block(b)
            skip_connection += skip
            
        mask = self.mask_activation(self.mask_conv(skip_connection))
        separated = e * mask
        
        out = self.decoder(separated)
        return out

if __name__ == "__main__":
    model = CausalConvTasNet()
    test_input = torch.randn(1, 1, 16000) # 1 second of audio
    test_output = model(test_input)
    print(f"Input shape: {test_input.shape}")
    print(f"Output shape: {test_output.shape}")
    print("Conv-TasNet build successful.")
