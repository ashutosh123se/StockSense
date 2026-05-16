try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    torch = None  # type: ignore
    nn = None     # type: ignore
    F = None      # type: ignore


class StockCNNLSTM:
    """
    1D-CNN spatial extractor -> LSTM temporal modeler.
    Outputs: directional logits, confidence score, predicted price delta %.
    Requires torch. If torch is not installed, instantiation raises ImportError.
    """
    def __new__(cls, *args, **kwargs):
        if not _TORCH_AVAILABLE:
            raise ImportError("PyTorch is not installed. StockCNNLSTM requires torch.")
        return _StockCNNLSTMImpl(*args, **kwargs)


if _TORCH_AVAILABLE:
    class _StockCNNLSTMImpl(nn.Module):
        def __init__(self, input_size=47, num_classes=3):
            super().__init__()
            self.conv1 = nn.Conv1d(input_size, 64, kernel_size=3, padding=1)
            self.bn1 = nn.BatchNorm1d(64)
            self.pool1 = nn.MaxPool1d(2)
            self.conv2 = nn.Conv1d(64, 128, kernel_size=3, padding=1)
            self.bn2 = nn.BatchNorm1d(128)
            self.pool2 = nn.MaxPool1d(2)
            self.conv3 = nn.Conv1d(128, 256, kernel_size=3, padding=1)
            self.bn3 = nn.BatchNorm1d(256)
            self.lstm = nn.LSTM(256, 256, num_layers=2, batch_first=True, dropout=0.2)
            self.fc1 = nn.Linear(256, 128)
            self.ln = nn.LayerNorm(128)
            self.relu = nn.ReLU()
            self.dropout = nn.Dropout(0.3)
            self.out_class = nn.Linear(128, num_classes)
            self.out_delta = nn.Linear(128, 1)

        def forward(self, x):
            x = x.transpose(1, 2)
            x = F.gelu(self.pool1(self.bn1(self.conv1(x))))
            x = F.gelu(self.pool2(self.bn2(self.conv2(x))))
            x = F.gelu(self.bn3(self.conv3(x)))
            x = x.transpose(1, 2)
            out, _ = self.lstm(x)
            attn_weights = F.softmax(torch.bmm(out, out.transpose(1, 2)) / (256 ** 0.5), dim=-1)
            context = torch.bmm(attn_weights, out)[:, -1, :]
            x = self.dropout(self.relu(self.ln(self.fc1(context))))
            return self.out_class(x), self.out_delta(x)
else:
    class _StockCNNLSTMImpl:  # type: ignore
        pass
