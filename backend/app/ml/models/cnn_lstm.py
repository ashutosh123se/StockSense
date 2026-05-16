import torch
import torch.nn as nn
import torch.nn.functional as F

class StockCNNLSTM(nn.Module):
    """
    1D-CNN spatial extractor -> LSTM temporal modeler.
    Outputs: directional logits, confidence score, predicted price delta %
    """
    def __init__(self, input_size=47, num_classes=3):
        super(StockCNNLSTM, self).__init__()
        
        # CNN blocks (input expects [batch, features, seq_len])
        self.conv1 = nn.Conv1d(input_size, 64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(64)
        self.pool1 = nn.MaxPool1d(2)
        
        self.conv2 = nn.Conv1d(64, 128, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(128)
        self.pool2 = nn.MaxPool1d(2)
        
        self.conv3 = nn.Conv1d(128, 256, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(256)
        
        # LSTM block
        self.lstm = nn.LSTM(256, 256, num_layers=2, batch_first=True, dropout=0.2)
        
        # Head
        self.fc1 = nn.Linear(256, 128)
        self.ln = nn.LayerNorm(128)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)
        
        self.out_class = nn.Linear(128, num_classes)
        self.out_delta = nn.Linear(128, 1)  # auxiliary regression head
        
    def forward(self, x):
        # x shape: [batch, seq_len, features]
        # reshape for Conv1d: [batch, features, seq_len]
        x = x.transpose(1, 2)
        
        x = self.conv1(x)
        x = self.bn1(x)
        x = F.gelu(x)
        x = self.pool1(x)
        
        x = self.conv2(x)
        x = self.bn2(x)
        x = F.gelu(x)
        x = self.pool2(x)
        
        x = self.conv3(x)
        x = self.bn3(x)
        x = F.gelu(x)
        
        # reshape for LSTM: [batch, seq_len', features']
        x = x.transpose(1, 2)
        
        out, (hn, cn) = self.lstm(x)
        
        # Scaled dot-product attention
        # Query: out, Key: out, Value: out
        attn_weights = F.softmax(torch.bmm(out, out.transpose(1, 2)) / (256 ** 0.5), dim=-1)
        context = torch.bmm(attn_weights, out)
        
        # Take last step
        context = context[:, -1, :]
        
        x = self.fc1(context)
        x = self.ln(x)
        x = self.relu(x)
        x = self.dropout(x)
        
        logits = self.out_class(x)
        delta = self.out_delta(x)
        
        return logits, delta
